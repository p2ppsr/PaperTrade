# PaperTrade DevOps

PaperTrade production runs on the Project Babbage private infrastructure Kubernetes cluster and uses the
local registry at `10.152.183.28:5000` for pushes and
`registry.cars-operator-system.svc.cluster.local:5000` for cluster pulls.

## Image Strategy

The runtime image is split into two layers of ownership:

- `p2ppsr/papertrade-runtime-base:<tag>` contains Node.js plus the heavy
  document conversion stack: Poppler, LibreOffice Writer, and Calibre.
- `p2ppsr/papertrade:<short-sha>-production-<date>` contains the application
  build, production node modules, migrations, and static frontend assets.

The runtime base image should change only when the OS, Node major version, or
document conversion tooling changes. Normal PaperTrade source deployments should
build only the app image.

## Build Cache

`scripts/k8s/build-local-image.sh` runs Kaniko in the cluster and enables a
registry-backed cache:

```bash
KANIKO_CACHE_REPO=10.152.183.28:5000/p2ppsr/papertrade-build-cache
KANIKO_CACHE_TTL=720h
```

This keeps npm install layers and build layers close to the cluster. Rebuilds
after TypeScript or CSS changes should reuse dependency layers instead of
downloading packages again over Starlink.

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

`.github/workflows/deploy-production-local.yml` runs on the Project Babbage private infrastructure
self-hosted runner labels:

- `private-production-local-deploy`
- `linux-amd64`
- `docker`
- `kubectl`
- `local-registry`

The workflow accepts an optional `source_sha` and a `build_runtime_base` switch.
Keep `build_runtime_base=false` for normal deploys. Set it to `true` only after
reviewing changes to `Dockerfile.runtime-base`, Node major versions, or document
conversion dependencies.
