#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Build and publish PaperTrade using an authenticated Linux/amd64 rootless Docker daemon.
BUILD_TARGET: app (default), runtime-base, or all.
SOURCE_SHA: source commit (default HEAD). IMAGE_TAG: traceable application tag.
REGISTRY_PUSH / REGISTRY_PULL: authenticated registry endpoints.
RUNTIME_BASE_TAG: runtime tag. RUNTIME_BASE_IMAGE: optional exact runtime reference.
Rebuilding the runtime always refreshes distribution packages without cached RUN layers.
USAGE
  exit 0
fi

cd "$(git rev-parse --show-toplevel)"
source_sha="${SOURCE_SHA:-$(git rev-parse HEAD)}"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'SOURCE_SHA must be a full commit SHA' >&2; exit 2; }
engine="$(docker info --format '{{json .}}')"
jq -e '.OSType == "linux" and (.Architecture == "x86_64" or .Architecture == "amd64") and any(.SecurityOptions[]; startswith("name=rootless"))' <<<"$engine" >/dev/null || {
  echo 'Production builds require the managed Linux/amd64 rootless Docker daemon' >&2; exit 2;
}
registry_push="${REGISTRY_PUSH:-registry.cars-operator-system.svc.cluster.local:5000}"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
image_tag="${IMAGE_TAG:-${source_sha:0:12}-production-$(date -u +%F)}"
runtime_base_tag="${RUNTIME_BASE_TAG:-node24-trixie-docs-r2}"
build_target="${BUILD_TARGET:-app}"
[[ "$build_target" == app || "$build_target" == runtime-base || "$build_target" == all ]] || { echo 'Invalid BUILD_TARGET' >&2; exit 2; }
runtime_repo="${registry_push}/p2ppsr/papertrade-runtime-base"
app_repo="${registry_push}/p2ppsr/papertrade"
runtime_ref="${RUNTIME_BASE_IMAGE:-${runtime_repo}:${runtime_base_tag}}"

# Docker uses the runner's existing registry credentials and verified TLS.
# Resolve every base and published image to a registry-verified immutable digest.
digest_for() {
  docker image inspect "$1" --format '{{json .RepoDigests}}' |
    jq -er --arg repo "$2" '[.[] | select(startswith($repo + "@sha256:"))][0] | split("@")[1] | select(test("^sha256:[0-9a-f]{64}$"))'
}
if [[ "$build_target" == runtime-base || "$build_target" == all ]]; then
  runtime_ref="${runtime_repo}:${runtime_base_tag}"
  docker build --platform linux/amd64 --pull --no-cache \
    --file Dockerfile.runtime-base --tag "$runtime_ref" .
  docker push "$runtime_ref"
fi
docker pull "$runtime_ref"
runtime_base_digest="$(docker image inspect "$runtime_ref" --format '{{json .RepoDigests}}' | jq -er '.[0] | split("@")[1] | select(test("^sha256:[0-9a-f]{64}$"))')"
runtime_base_image="${registry_pull}/p2ppsr/papertrade-runtime-base@${runtime_base_digest}"
# Pull via the exact name used in FROM so Docker validates that registry path too.
docker pull "$runtime_base_image"
last_image="$runtime_base_image"
last_digest="$runtime_base_digest"
last_tag="$runtime_base_tag"
if [[ "$build_target" == app || "$build_target" == all ]]; then
  docker build --platform linux/amd64 --pull --file Dockerfile \
    --build-arg "RUNTIME_BASE_IMAGE=$runtime_base_image" \
    --build-arg "VITE_APP_VERSION=$source_sha" --tag "${app_repo}:${image_tag}" .
  docker push "${app_repo}:${image_tag}"
  last_digest="$(digest_for "${app_repo}:${image_tag}" "$app_repo")"
  last_image="${registry_pull}/p2ppsr/papertrade:${image_tag}"
  last_tag="$image_tag"
fi
jq -n --arg source_sha "$source_sha" --arg build_target "$build_target" \
  --arg image "$last_image" --arg image_tag "$last_tag" --arg image_digest "$last_digest" \
  --arg runtime_base_image "$runtime_base_image" --arg runtime_base_digest "$runtime_base_digest" \
  '{source_sha:$source_sha,environment:"production",build_target:$build_target,image:$image,image_tag:$image_tag,image_digest:$image_digest,runtime_base_image:$runtime_base_image,runtime_base_digest:$runtime_base_digest}' > release-manifest.json
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'image_tag=%s\nimage=%s\nimage_digest=%s\nruntime_base_image=%s\n' \
    "$last_tag" "$last_image" "$last_digest" "$runtime_base_image" >> "$GITHUB_OUTPUT"
fi
printf 'Published %s@%s\n' "$last_image" "$last_digest"
