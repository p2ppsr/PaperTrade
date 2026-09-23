import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('promote', pathlib.Path(__file__).parents[1] / 'promote-guarded.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
IMAGE = 'registry/papertrade@sha256:' + 'a' * 64
LABELS = {'app.kubernetes.io/name': 'papertrade', 'app.kubernetes.io/component': 'api'}
DEPLOYMENT = {'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': {'name': 'papertrade'},
 'spec': {'replicas': 2, 'selector': {'matchLabels': LABELS},
 'template': {'metadata': {'labels': LABELS}, 'spec': {'affinity': {'podAntiAffinity': {
 'requiredDuringSchedulingIgnoredDuringExecution': [{'labelSelector': {'matchLabels': LABELS}, 'topologyKey': 'kubernetes.io/hostname'}]}}}}}}
SERVICE = {'apiVersion': 'v1', 'kind': 'Service', 'metadata': {'name': 'papertrade'}, 'spec': {'selector': LABELS}}
POLICY = {'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy', 'metadata': {'name': 'boundary'},
          'spec': {'podSelector': {'matchLabels': LABELS}, 'policyTypes': ['Egress'], 'egress': []}}


class PromotionSafety(unittest.TestCase):
    def setUp(self):
        m.FAILURE.clear()
        m.STOP.clear()
        self.trace = []

    def exercise(self, failure=None):
        def command(*args, value=None):
            self.trace.append(('command', args, value))
            if args[0] == 'apply' and '--dry-run=client' in args:
                return json.dumps({'kind': 'List', 'items': [DEPLOYMENT, SERVICE]})
            if args[0] == 'patch' and failure == 'ambiguous-cutover':
                raise RuntimeError('connection lost after patch')
            return ''
        def read(kind, name=None, selector=None):
            if kind == 'service': return SERVICE
            if kind == 'deployments': return {'items': []}
            if kind == 'networkpolicies': return {'items': [POLICY]}
            if kind == 'pdb': return {'status': {'disruptionsAllowed': 1}}
            raise AssertionError(kind)
        def pool(name, component, image):
            self.trace.append(('pool', name))
            if name == 'papertrade' and failure == 'canonical-not-ready':
                raise RuntimeError('canonical not ready')
            return [{'metadata': {'name': name + '-a'}}, {'metadata': {'name': name + '-b'}}]
        def smoke(pods):
            self.trace.append(('smoke', pods[0]['metadata']['name']))
            if failure == 'canary-smoke': raise RuntimeError('canary failed')
        def record(event, **data): self.trace.append(('event', event, data))
        probe = Mock(returncode=0)
        probe.communicate.return_value = ('', '')
        with patch.object(m, 'command', command), patch.object(m, 'read', read), \
             patch.object(m, 'ready_pool', pool), patch.object(m, 'endpoints'), \
             patch.object(m, 'smoke', smoke), patch.object(m, 'record', record), \
             patch.object(m, 'pause', lambda seconds: self.trace.append(('wait', seconds))), \
             patch.object(m.threading, 'Thread'), patch.object(m.subprocess, 'Popen', return_value=probe):
            m.main('manifest.yaml', IMAGE)

    def test_success_drains_before_replacing_legacy_deployment(self):
        self.exercise()
        cutover = next(i for i, t in enumerate(self.trace) if t[:2] == ('event', 'public-cutover-to-candidate'))
        canonical_apply = next(i for i, t in enumerate(self.trace) if t[0] == 'command' and t[1] == ('apply', '-f', '-')
                               and json.loads(t[2]).get('kind') == 'Deployment'
                               and json.loads(t[2])['metadata']['name'] == 'papertrade')
        self.assertIn(('wait', 10), self.trace[cutover:canonical_apply])
        self.assertTrue(any(t[:2] == ('event', 'promotion-accepted') for t in self.trace))
        self.assertTrue(any(t[0] == 'command' and t[1][:2] == ('delete', 'deployment') for t in self.trace))

    def test_bad_canary_never_changes_public_service_or_main_deployment(self):
        with self.assertRaisesRegex(RuntimeError, 'canary failed'): self.exercise('canary-smoke')
        self.assertFalse(any(t[0] == 'command' and t[1][0] == 'patch' for t in self.trace))
        self.assertTrue(any(t[0] == 'command' and t[1][:2] == ('delete', 'deployment') for t in self.trace))

    def test_ambiguous_cutover_preserves_candidate(self):
        with self.assertRaisesRegex(RuntimeError, 'connection lost'): self.exercise('ambiguous-cutover')
        self.assertFalse(any(t[0] == 'command' and t[1][:2] == ('delete', 'deployment') for t in self.trace))
        self.assertTrue(any(t[:2] == ('event', 'recovery-required') for t in self.trace))

    def test_failed_canonical_rollout_preserves_serving_candidate(self):
        with self.assertRaisesRegex(RuntimeError, 'canonical not ready'): self.exercise('canonical-not-ready')
        self.assertFalse(any(t[0] == 'command' and t[1][:2] == ('delete', 'deployment') for t in self.trace))
        self.assertFalse(any(t[:2] == ('event', 'promotion-accepted') for t in self.trace))

    def test_latched_public_failure_prevents_apply(self):
        m.FAILURE.set()
        with patch.object(m, 'command') as command:
            with self.assertRaisesRegex(RuntimeError, 'failure latched'): m.apply(SERVICE)
            command.assert_not_called()

    def test_endpoint_count_alone_cannot_accept_stale_public_pool(self):
        def rows(prefix):
            return {'items': [{'endpoints': [{'nodeName': 'node'+str(i), 'targetRef': {'name': prefix+str(i)},
                                            'conditions': {'ready': True}} for i in range(2)]}]}
        with patch.object(m, 'read', side_effect=[rows('old'), rows('new')]), \
             patch.object(m, 'pause') as pause, patch.object(m, 'record'):
            m.endpoints('papertrade', {'new0', 'new1'})
            pause.assert_called_once_with(2)


if __name__ == '__main__': unittest.main()
