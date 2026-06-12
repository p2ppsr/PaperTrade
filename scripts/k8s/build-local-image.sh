#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scripts/k8s/build-local-image.sh

Builds PaperTrade images with in-cluster Kaniko and pushes them to the local
registry. App builds use a persistent Kaniko cache and a reusable runtime base
image so normal deployments avoid re-downloading document conversion packages.

Environment:
  BUILD_TARGET             app, runtime-base, or all. Defaults to app.
  SOURCE_SHA               Source commit SHA. Defaults to current git HEAD.
  IMAGE_TAG                App image tag. Defaults to <short-sha>-production-<utc-date>.
  RUNTIME_BASE_TAG         Runtime base tag. Defaults to node22-bookworm-docs-2026-06-11.
  RUNTIME_BASE_IMAGE       Pull image used as Dockerfile runtime base. Defaults to
                           <REGISTRY_PULL>/p2ppsr/papertrade-runtime-base:<tag>.
  REGISTRY_PUSH            Push registry. Defaults to 10.152.183.28:5000.
  REGISTRY_PULL            Pull registry written into manifests and build args.
  KANIKO_CACHE_REPO        Cache repository. Defaults to <REGISTRY_PUSH>/p2ppsr/papertrade-build-cache.
  KANIKO_CACHE_TTL         Cache TTL. Defaults to 720h.
  REGISTRY_DIGEST_TIMEOUT  Seconds to wait for registry digest lookup. Defaults to 5.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

source_sha="${SOURCE_SHA:-$(git rev-parse HEAD)}"
short_sha="${source_sha:0:12}"
image_date="${IMAGE_DATE:-$(date -u +%F)}"
image_tag="${IMAGE_TAG:-${short_sha}-production-${image_date}}"
runtime_base_tag="${RUNTIME_BASE_TAG:-node22-bookworm-docs-2026-06-11}"
registry_push="${REGISTRY_PUSH:-10.152.183.28:5000}"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
kubectl_cmd="${KUBECTL:-kubectl}"
kaniko_image="${KANIKO_IMAGE:-gcr.io/kaniko-project/executor:debug}"
build_target="${BUILD_TARGET:-app}"
cache_repo="${KANIKO_CACHE_REPO:-${registry_push}/p2ppsr/papertrade-build-cache}"
cache_ttl="${KANIKO_CACHE_TTL:-720h}"
registry_digest_timeout="${REGISTRY_DIGEST_TIMEOUT:-5}"
runtime_base_push_image="${registry_push}/p2ppsr/papertrade-runtime-base:${runtime_base_tag}"
runtime_base_pull_image="${REGISTRY_PULL_RUNTIME_BASE:-${registry_pull}/p2ppsr/papertrade-runtime-base:${runtime_base_tag}}"
runtime_base_image="${RUNTIME_BASE_IMAGE:-${runtime_base_pull_image}}"
app_push_image="${registry_push}/p2ppsr/papertrade:${image_tag}"
app_pull_image="${registry_pull}/p2ppsr/papertrade:${image_tag}"
pod="papertrade-kaniko-$(date +%s)"
last_image="${app_pull_image}"
last_tag="${image_tag}"
last_digest=""

case "${build_target}" in
  app | runtime-base | all)
    ;;
  *)
    printf 'Unsupported BUILD_TARGET=%s\n' "${build_target}" >&2
    usage
    exit 2
    ;;
esac

cleanup() {
  "${kubectl_cmd}" delete pod "${pod}" --ignore-not-found=true --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf 'Starting PaperTrade Kaniko builder pod %s\n' "${pod}"
"${kubectl_cmd}" run "${pod}" --restart=Never --image="${kaniko_image}" --command -- sleep 3600
"${kubectl_cmd}" wait --for=condition=Ready "pod/${pod}" --timeout=3m
"${kubectl_cmd}" exec "${pod}" -- mkdir -p /kaniko/context

COPYFILE_DISABLE=1 tar \
  --exclude .git \
  --exclude .github \
  --exclude node_modules \
  --exclude build \
  --exclude dist \
  --exclude coverage \
  --exclude data \
  --exclude docs \
  --exclude infra \
  --exclude scripts \
  --exclude .env \
  --exclude release-manifest.json \
  --exclude npm-debug.log \
  --exclude .DS_Store \
  --exclude '._*' \
  --exclude '*.log' \
  --exclude '*.tmp' \
  --exclude tmp \
  -cf - . | "${kubectl_cmd}" exec -i "${pod}" -- tar -xf - -C /kaniko/context

run_kaniko() {
  local dockerfile="$1"
  local destination="$2"
  shift 2
  local digest_file="/kaniko/digest-$(basename "${dockerfile}")"
  local image_ref="${destination#${registry_push}/}"
  local image_repo="${image_ref%:*}"
  local image_ref_tag="${image_ref##*:}"

  printf 'Building %s\n' "${destination}"
  "${kubectl_cmd}" exec "${pod}" -- /kaniko/executor \
    --context=/kaniko/context \
    --dockerfile="/kaniko/context/${dockerfile}" \
    --destination="${destination}" \
    --digest-file="${digest_file}" \
    --cache=true \
    --cache-repo="${cache_repo}" \
    --cache-ttl="${cache_ttl}" \
    --insecure \
    --insecure-registry="${registry_push}" \
    --insecure-registry="${registry_pull}" \
    --skip-tls-verify \
    "$@"

  last_digest="$("${kubectl_cmd}" exec "${pod}" -- cat "${digest_file}" 2>/dev/null || true)"
  if [[ -z "${last_digest}" ]] && command -v curl >/dev/null 2>&1; then
    last_digest="$(
      curl --fail --silent --show-error --head --max-time "${registry_digest_timeout}" \
        -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
        "http://${registry_push}/v2/${image_repo}/manifests/${image_ref_tag}" \
        | awk -F': ' 'tolower($1) == "docker-content-digest" { gsub("\r", "", $2); print $2; exit }' \
        || true
    )"
  fi
}

if [[ "${build_target}" == "runtime-base" || "${build_target}" == "all" ]]; then
  run_kaniko "Dockerfile.runtime-base" "${runtime_base_push_image}"
  last_image="${runtime_base_pull_image}"
  last_tag="${runtime_base_tag}"
fi

if [[ "${build_target}" == "app" || "${build_target}" == "all" ]]; then
  run_kaniko "Dockerfile" "${app_push_image}" \
    --build-arg="RUNTIME_BASE_IMAGE=${runtime_base_image}"
  last_image="${app_pull_image}"
  last_tag="${image_tag}"
fi

cat > release-manifest.json <<EOF
{
  "source_sha": "${source_sha}",
  "environment": "production",
  "build_target": "${build_target}",
  "image_tag": "${last_tag}",
  "registry_push": "${registry_push}",
  "registry_pull": "${registry_pull}",
  "image": "${last_image}",
  "image_digest": "${last_digest}",
  "runtime_base_image": "${runtime_base_image}",
  "runtime_base_tag": "${runtime_base_tag}",
  "cache_repo": "${cache_repo}",
  "cache_ttl": "${cache_ttl}"
}
EOF

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'image_tag=%s\n' "${last_tag}"
    printf 'image=%s\n' "${last_image}"
    printf 'image_digest=%s\n' "${last_digest}"
    printf 'runtime_base_image=%s\n' "${runtime_base_image}"
  } >> "${GITHUB_OUTPUT}"
fi

printf 'Pushed image:\n  %s\n' "${last_image}"
if [[ -n "${last_digest}" ]]; then
  printf 'Digest:\n  %s\n' "${last_digest}"
fi
