#!/usr/bin/env python3
"""Promote through a two-node shadow pool, including legacy Pods without a drain hook."""
import copy
import datetime as dt
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

NS = 'papertrade-prod'
CANDIDATE = 'papertrade-release-candidate'
COMPONENT = 'release-candidate'
KUBECTL = os.environ.get('KUBECTL', 'kubectl')
FAILURE = threading.Event()
STOP = threading.Event()
PUBLIC = 'https://papertrade.metanet.app'
BOOK = '5d0c3c44-0b3f-4b1a-94b4-000000000001'


def record(event, **data):
    row = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'event': event, **data}
    with open('rollout-evidence.jsonl', 'a') as handle:
        handle.write(json.dumps(row) + '\n')
    print(json.dumps(row), flush=True)


def command(*args, value=None):
    result = subprocess.run([KUBECTL, '-n', NS, *args], input=value,
                            capture_output=True, text=True, timeout=90)
    if result.returncode:
        # Never echo manifest input or Secret objects into CI logs.
        raise RuntimeError(f'kubectl {args[0]} failed: {result.stderr[:1200]}')
    return result.stdout


def read(kind, name=None, selector=None):
    args = ['get', kind]
    if name:
        args.append(name)
    if selector:
        args += ['-l', selector]
    return json.loads(command(*args, '-o', 'json'))


def apply(resource):
    guard()
    command('apply', '-f', '-', value=json.dumps(resource))


def guard():
    if FAILURE.is_set():
        raise RuntimeError('Public probe failure latched; rollout frozen. Preserve serving pool for recovery.')


def pause(seconds):
    if FAILURE.wait(seconds):
        guard()


def public_watch():
    while not STOP.is_set():
        for route in ['/', '/healthz', '/api/publications', f'/api/publications/{BOOK}/pages/1']:
            started = time.monotonic()
            try:
                with urllib.request.urlopen(PUBLIC + route, timeout=12) as response:
                    data = response.read()
                    if response.status != 200:
                        raise RuntimeError(f'HTTP {response.status}')
                    if route.endswith('/pages/1') and not data.startswith(bytes.fromhex('89504e470d0a1a0a')):
                        raise RuntimeError('Free page did not return PNG')
                record('public-probe', route=route, seconds=round(time.monotonic()-started, 4), ok=True)
            except Exception as exc:
                record('ABORT', route=route, seconds=round(time.monotonic()-started, 4), error=str(exc))
                FAILURE.set()
                return
        STOP.wait(2)


def ready_pool(name, component, image, timeout=900):
    deadline = time.monotonic() + timeout
    selector = f'app.kubernetes.io/name=papertrade,app.kubernetes.io/component={component}'
    while time.monotonic() < deadline:
        guard()
        deployment = read('deployment', name)
        status = deployment.get('status', {})
        pods = [p for p in read('pods', selector=selector)['items'] if not p['metadata'].get('deletionTimestamp')]
        nodes = {p['spec'].get('nodeName') for p in pods}
        good = (status.get('observedGeneration') == deployment['metadata']['generation']
                and all(status.get(key) == 2 for key in ['updatedReplicas', 'readyReplicas', 'availableReplicas'])
                and len(pods) == 2 and len(nodes) == 2 and None not in nodes)
        for pod in pods:
            good = good and all(c['image'] == image for c in pod['spec']['containers'])
            good = good and any(c.get('type') == 'Ready' and c.get('status') == 'True'
                                for c in pod.get('status', {}).get('conditions', []))
            good = good and all(image.split('@')[-1] in c.get('imageID', '')
                                for c in pod.get('status', {}).get('containerStatuses', []))
        if good:
            record('pool-ready', deployment=name, generation=deployment['metadata']['generation'],
                   image=image, nodes=sorted(nodes), pods=[p['metadata']['name'] for p in pods])
            return pods
        pause(3)
    raise RuntimeError(f'{name} did not reconcile two exact-image Ready replicas')


def endpoints(service, expected_pods=None, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        guard()
        rows = [e for item in read('endpointslices', selector=f'kubernetes.io/service-name={service}')['items']
                for e in item.get('endpoints', []) if e.get('conditions', {}).get('ready') is True]
        if (len(rows) == 2 and len({e.get('nodeName') for e in rows}) == 2
                and (expected_pods is None or {e.get('targetRef', {}).get('name') for e in rows} == expected_pods)):
            record('endpoints-ready', service=service, nodes=sorted(e['nodeName'] for e in rows))
            return
        pause(2)
    raise RuntimeError(f'{service} lacks two Ready endpoints on distinct nodes')


SMOKE = r"""
const base=process.argv[1]||'http://127.0.0.1:8080';
const peer=process.argv[2];
async function get(path) { const r=await fetch(base+path,{signal:AbortSignal.timeout(10000)}); if(r.status!==200)throw Error(path+': '+r.status);return r; }
const health=await (await get('/healthz')).json();if(!health.ok)throw Error('health not OK');
await get('/'); const status=await (await get('/api/status')).json();if(status.status!=='success')throw Error('status not success');
const catalog=await (await get('/api/publications')).json();const id=catalog.publications[0]?.id;if(!id)throw Error('empty catalog');
const page=await get(`/api/publications/${id}/pages/1`);const bytes=Buffer.from(await page.arrayBuffer());
if(page.headers.get('x-papertrade-page-access')!=='free'||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('free PNG failed');
const view=await (await get(`/api/publications/${id}/pages/1?format=json`)).json();
if(view.status!=='success'||view.pageAccessMode!=='free'||!view.imageUrl?.startsWith(`/api/publications/${id}/pages/1/rendered?`))throw Error('free JSON view failed');
const rendered=Buffer.from(await (await get(view.imageUrl)).arrayBuffer());if(rendered.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('rendered PNG failed');
const paid=await fetch(base+`/api/publications/${id}/pages/2`,{signal:AbortSignal.timeout(10000)});
if(paid.status!==401)throw Error('anonymous paid page did not reject');
const {AuthFetch,PrivateKey,ProtoWallet}=await import('@bsv/sdk');
const wallet=new ProtoWallet(PrivateKey.fromRandom());let challenge=false,spendBlocked=false;
wallet.createAction=async args=>{
  if(args.outputs?.length!==1||args.outputs[0].satoshis!==status.pricePerPageSats)throw Error('Unexpected payment amount');
  spendBlocked=true;throw Error('TEST_PAYMENT_DISABLED');
};
let sequence=0;const destinations=new Set();
const observe=async (url,init)=>{
  const parsed=new URL(String(url));
  const destination=peer&&sequence++%2===1?peer:base;
  destinations.add(destination);
  const response=await fetch(destination+parsed.pathname+parsed.search,{...init,signal:AbortSignal.timeout(10000)});
  if(String(url).includes('/pages/2')){
    if(response.status!==402||Number(response.headers.get('x-bsv-payment-satoshis-required'))!==status.pricePerPageSats||!response.headers.get('x-bsv-auth-signature'))throw Error('Authenticated payment challenge failed');
    challenge=true;
  }
  return response;
};
const auth=new AuthFetch(wallet,undefined,undefined,undefined,{},observe);
try{await auth.fetch(base+`/api/publications/${id}/pages/2?format=json`);throw Error('Expected blocked synthetic payment');}
catch(error){if(error.message!=='TEST_PAYMENT_DISABLED')throw error;}
if(!challenge||!spendBlocked)throw Error('Authenticated payment probe incomplete');
if(peer&&destinations.size!==2)throw Error('Cross-replica authentication was not exercised');
console.log(JSON.stringify({health:true,catalog:true,freePNG:true,freeJSON:true,renderedPNG:true,paidAccessDenied:true,authenticatedPaymentChallenge:true,spendingDisabled:true,crossReplica:destinations.size===2}));
"""


def smoke(pods):
    if len(pods) != 2:
        raise RuntimeError('Smoke acceptance requires two replicas')
    for index, pod in enumerate(pods):
        guard()
        peer = pods[1-index]
        address = peer['status']['podIP']
        if ':' in address:
            address = '['+address+']'
        command('exec', pod['metadata']['name'], '--', 'node', '--input-type=module', '-e', SMOKE,
                'http://127.0.0.1:8080', 'http://'+address+':8080')
        record('pod-smoke-passed', pod=pod['metadata']['name'],
               peer=peer['metadata']['name'], crossReplica=True, spendingDisabled=True)


def main(manifest, image):
    if '@sha256:' not in image or len(image.rsplit('@sha256:', 1)[1]) != 64:
        raise ValueError('An immutable candidate digest is required')
    # Convert source manifests without merging live objects. Dry-run apply reads
    # existing resources and carries their allocated Service IPs and server
    # metadata into the copy, which cannot be reused by the shadow pool.
    rendered = command('create', '--dry-run=client', '-f', manifest, '-o', 'json')
    decoder, resources = json.JSONDecoder(), []
    while rendered.strip():
        item, end = decoder.raw_decode(rendered.lstrip())
        resources.extend(item['items'] if item.get('kind') == 'List' else [item])
        rendered = rendered.lstrip()[end:]
    desired = next(r for r in resources if r['kind'] == 'Deployment')
    service = next(r for r in resources if r['kind'] == 'Service')
    old_service = read('service', 'papertrade')
    if old_service['spec']['selector'].get('app.kubernetes.io/component') != 'api':
        raise RuntimeError('Public Service is already in a recovery state; operator reconciliation required')
    if any(d['metadata']['name'] == CANDIDATE for d in read('deployments')['items']):
        raise RuntimeError('A prior candidate still exists; preserve and reconcile it before a new promotion')
    endpoints('papertrade')
    # The shadow pool is never selected by the public Service until both Pods pass.
    candidate = copy.deepcopy(desired)
    candidate['metadata']['name'] = CANDIDATE
    candidate['spec']['selector']['matchLabels']['app.kubernetes.io/component'] = COMPONENT
    candidate['spec']['template']['metadata']['labels']['app.kubernetes.io/component'] = COMPONENT
    affinity = candidate['spec']['template']['spec']['affinity']['podAntiAffinity']['requiredDuringSchedulingIgnoredDuringExecution']
    for rule in affinity:
        rule['labelSelector']['matchLabels']['app.kubernetes.io/component'] = COMPONENT
    policies = []
    for policy in read('networkpolicies')['items']:
        selector = policy['spec']['podSelector'].get('matchLabels', {})
        if selector.get('app.kubernetes.io/name') == 'papertrade' and selector.get('app.kubernetes.io/component') == 'api':
            copied = {'apiVersion': policy['apiVersion'], 'kind': policy['kind'],
                      'metadata': {'name': CANDIDATE+'-'+str(len(policies)), 'namespace': NS},
                      'spec': copy.deepcopy(policy['spec'])}
            copied['spec']['podSelector']['matchLabels']['app.kubernetes.io/component'] = COMPONENT
            policies.append(copied)
    if not policies:
        raise RuntimeError('Refusing to create a candidate without the production network boundary')
    shadow_service = copy.deepcopy(service)
    shadow_service['metadata']['name'] = CANDIDATE
    shadow_service['spec']['selector']['app.kubernetes.io/component'] = COMPONENT
    shadow_pdb = {'apiVersion': 'policy/v1', 'kind': 'PodDisruptionBudget',
                  'metadata': {'name': CANDIDATE, 'namespace': NS},
                  'spec': {'minAvailable': 1, 'selector': copy.deepcopy(candidate['spec']['selector'])}}
    serving_candidate = False
    watcher = threading.Thread(target=public_watch, daemon=True)
    watcher.start()
    try:
        for resource in [*policies, shadow_service, shadow_pdb, candidate]:
            apply(resource)
        pods = ready_pool(CANDIDATE, COMPONENT, image)
        endpoints(CANDIDATE)
        smoke(pods)
        # Exercise withdrawal in the isolated pool while another node serves continuously.
        probe = subprocess.Popen([KUBECTL, '-n', NS, 'exec', pods[1]['metadata']['name'], '--', 'node',
          '--input-type=module', '-e',
          "for(let i=0;i<100;i++){const r=await fetch('http://"+CANDIDATE+":8080/healthz',{signal:AbortSignal.timeout(5000)});if(r.status!==200)throw Error('drain probe failed');await new Promise(r=>setTimeout(r,200));}"],
          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        command('delete', 'pod', pods[0]['metadata']['name'], '--wait=false')
        _, error = probe.communicate(timeout=50)
        if probe.returncode:
            raise RuntimeError('Isolated endpoint-withdrawal rehearsal failed: '+error[:500])
        record('drain-rehearsal-passed', probes=100)
        pods = ready_pool(CANDIDATE, COMPONENT, image)
        endpoints(CANDIDATE)
        smoke(pods)
        if read('pdb', CANDIDATE).get('status', {}).get('disruptionsAllowed', 0) < 1:
            raise RuntimeError('Candidate PDB does not allow one disruption')
        guard()
        selector = copy.deepcopy(old_service['spec']['selector'])
        selector['app.kubernetes.io/component'] = COMPONENT
        # A lost patch response is ambiguous: preserve the shadow pool before sending.
        serving_candidate = True
        command('patch', 'service', 'papertrade', '--type=merge', '-p', json.dumps({'spec': {'selector': selector}}))
        endpoints('papertrade', {p['metadata']['name'] for p in pods})
        record('public-cutover-to-candidate')
        # Old Pods have no hook: withdraw them and wait before touching their Deployment.
        pause(10)
        for resource in resources:
            if resource['kind'] != 'Service':
                apply(resource)
        pods = ready_pool('papertrade', 'api', image)
        smoke(pods)
        if read('pdb', 'papertrade').get('status', {}).get('disruptionsAllowed', 0) < 1:
            raise RuntimeError('Canonical PDB does not allow one disruption')
        apply(service)
        endpoints('papertrade', {p['metadata']['name'] for p in pods})
        serving_candidate = False
        record('public-cutover-to-canonical')
        pause(10)
        pause(30)
        record('promotion-accepted', image=image)
    finally:
        STOP.set()
        watcher.join(timeout=15)
        if serving_candidate:
            record('recovery-required', message='Candidate remains the public serving pool; preserve it and repair canonical deployment before switching back.')
        else:
            # Neither the legacy nor accepted public pool uses these objects.
            for kind, name in [('deployment', CANDIDATE), ('service', CANDIDATE), ('pdb', CANDIDATE),
                               *[('networkpolicy', p['metadata']['name']) for p in policies]]:
                command('delete', kind, name, '--ignore-not-found=true', '--wait=true', '--timeout=60s')
        guard()


if __name__ == '__main__':
    main(*sys.argv[1:])
