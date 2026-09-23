# PaperTrade DevOps

PaperTrade production runs on Project Babbage private Kubernetes infrastructure
and uses a private local registry for image pushes and cluster pulls.

These notes document the live Project Babbage production shape. Public
self-hosters can use the manifests and scripts as references, but the GitHub
Actions workflow and registry defaults assume private infrastructure and
production secrets.

## Image Strategy

The runtime image is split into two layers of ownership:

- `p2ppsr/papertrade-runtime-base:<tag>` contains Node.js plus the heavy
  document conversion stack: Poppler, LibreOffice Writer, and Calibre.
- `p2ppsr/papertrade:<short-sha>-production-<date>` contains the application
  build, production node modules, migrations, and static frontend assets.

The runtime base image should change only when the OS, Node major version, or
document conversion tooling changes. Normal PaperTrade source deployments should
build only the app image.

For a local Docker build outside Project Babbage infrastructure:

```bash
docker build -f Dockerfile.runtime-base -t papertrade-runtime-base:local .
docker build -t papertrade:local .
```

Production builds pass `RUNTIME_BASE_IMAGE` explicitly, so the public Dockerfile
default remains usable for local builders without changing the cluster workflow.

## Durable content storage

Production runs two replicas on separate nodes. Both use the internal S3 API
for publication files, rendered pages, avatars, and appearance assets. The
`papertrade-s3-credentials` Secret supplies a bucket-specific access key;
database, wallet, and S3 credentials are never stored in this repository.
`/data/papertrade` is an `emptyDir` scratch filesystem used only for upload,
conversion, rendering, and OCR work.

The deployment has a PDB with `minAvailable: 1` and hard hostname anti-affinity.
Before node maintenance, require two Ready endpoints on separate nodes and a
healthy four-member object store. Existing filesystem content must be copied
from a read-only source mount without delete or sync semantics before enabling
the S3-backed deployment. Retain the source PVC and PV through cutover
validation and the first verified off-site backup.

## Build Cache

`scripts/k8s/build-local-image.sh` uses the managed Linux/amd64 rootless
Docker daemon through the self-hosted runner. Its existing registry credentials
and TLS trust are required; anonymous insecure Kaniko builds are retired.
The persistent daemon reuses application dependency layers. Deliberate runtime
rebuilds use `--pull --no-cache` so distribution security updates are refreshed.
Every runtime base and application image is resolved to an immutable digest.

The production scanner reads a Docker archive of the pulled deployment digest.
The remote daemon and runner Pod have separate filesystems. The workflow extracts
Trivy from its digest-pinned Linux/amd64 image and executes the binary on the
runner, without starting a scanner container or mounting the workspace remotely.
Production and Docker credential environment variables are removed for scanning.
The existing critical/fixable-high policy remains mandatory before promotion.

## Common Commands

Build only the normal app image:

```bash
scripts/k8s/build-local-image.sh
```

Rebuild the heavy runtime base image deliberately:

```bash
BUILD_TARGET=runtime-base scripts/k8s/build-local-image.sh
```

Seed both the runtime base and app image in one run:

```bash
BUILD_TARGET=all scripts/k8s/build-local-image.sh
```

Deploy a previously built app image tag:

```bash
IMAGE_TAG=<tag> SQL_DATABASE_USER=<user> SQL_DATABASE_PASSWORD=<password> scripts/k8s/deploy-local.sh
```

## GitHub Actions

`.github/workflows/deploy-production-local.yml` runs on private self-hosted
runner labels:

- `linux-amd64`
- `docker`
- `kubectl`
- `local-registry`

The workflow accepts an optional `source_sha` and a `build_runtime_base` switch.
Keep `build_runtime_base=false` for normal deploys. Set it to `true` only after
reviewing changes to `Dockerfile.runtime-base`, Node major versions, or document
conversion dependencies.

## Runtime image security

`.github/workflows/image-security.yml` builds the complete runtime image on a
GitHub-hosted Linux/amd64 runner for every runtime-input change, once a week,
and on manual dispatch. It scans the exact built image with digest-pinned
Trivy `0.73.0`, retains the JSON report, and rejects any critical occurrence
or any high occurrence for which the distribution publishes a fixed version.
An unfixable critical can pass only when its exact CVE, binary package, and
installed version appear in
`.github/security/trivy-critical-allowlist.json` with a current review,
Debian-tracker source, risk rationale, and unexpired deadline. New, expired,
stale, or newly fixable criticals fail the build. Exception records are short:
the initial Debian Trixie set expires on `2026-09-07`, so a weekly scan cannot
turn a temporary upstream wait into permanent acceptance.

The 2026-08-24 review accepted eight such occurrences for at most fourteen
days. Debian classifies the GLib, Mbed TLS, libxml2, Perl Archive::Tar, 32-bit
Perl regex, and Pillow findings as minor/no-DSA or postponed in Trixie. The
runtime does not expose the affected D-Bus introspection, Mbed TLS termination,
Perl archive extraction, or enormous/32-bit Perl regex paths. PaperTrade does
process untrusted documents, so the libxml2 and Pillow exceptions remain
deliberately short even though their specific XML and McIDAS AREA paths are not
supported application inputs. Remove an exception as soon as its finding
disappears; the gate rejects a stale record rather than silently accumulating
waivers.

The scanner gate runs outside the production cluster. This keeps large
LibreOffice and Calibre rebuild downloads off the Evans Creek Starlink links
and prevents a security candidate build from competing with production pods.
The production deploy remains a separate, explicitly dispatched workflow.

## Guarded Kubernetes promotion

Production builds must pass the runtime policy on their exact immutable image
digest. `deploy-local.sh` requires `IMAGE_TAG` and `IMAGE_DIGEST`; the deployment
workflow supplies both from its build output and retains the scan and rollout
evidence, including on failure. The SDK upgrade includes no database migration.
Any future schema change needs compatibility review before using this procedure.

`promote-guarded.py` creates two candidate replicas on distinct nodes behind a
private Service, with a PDB and a copy of the existing production egress boundary.
Both replicas must serve health, status, catalog and a real stored free-page PNG;
an anonymous paid-page request must still be denied. The candidate's ten-second
preStop hook is exercised by withdrawing one candidate while another node serves
100 consecutive requests. Two exact-image Ready replicas must return before
promotion. Public root, health, catalog and stored-page probes run throughout.

The public Service then selects the verified candidate pool. Its EndpointSlices
must name those exact Pods. Only after ten seconds of withdrawal may the legacy
Deployment change, which also protects old Pods that did not have a drain hook.
After the canonical pool observes its new generation and has two Ready, available
replicas at the exact digest, both pass content checks and its PDB permits one
disruption, traffic returns to it. The temporary pool drains before removal.

A failed or ambiguous cutover keeps the candidate pool intact. A failed canonical
rollout leaves the two verified candidates serving; inspect the latched failure,
repair or roll back the canonical Deployment, verify it, then explicitly switch
back before removing candidates. Never rerun over a surviving candidate pool or
delete that pool while the public Service selects it. A failure before cutover
removes only the isolated candidate resources and preserves the old public pool.
Network-ops fleet gates and independent public probes remain required around
the workflow.
