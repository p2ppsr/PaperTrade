#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

source_sha="${SOURCE_SHA:-$(git rev-parse HEAD)}"
short_sha="${source_sha:0:12}"
image_date="${IMAGE_DATE:-$(date -u +%F)}"
image_tag="${IMAGE_TAG:-${short_sha}-production-${image_date}}"
registry_push="${REGISTRY_PUSH:-10.152.183.28:5000}"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
kubectl_cmd="${KUBECTL:-kubectl}"
kaniko_image="${KANIKO_IMAGE:-gcr.io/kaniko-project/executor:debug}"

push_image="${registry_push}/p2ppsr/papertrade:${image_tag}"
pull_image="${registry_pull}/p2ppsr/papertrade:${image_tag}"
pod="papertrade-kaniko-$(date +%s)"

printf 'Building PaperTrade image %s\n' "${image_tag}"
cleanup() {
  "${kubectl_cmd}" delete pod "${pod}" --ignore-not-found=true >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${kubectl_cmd}" run "${pod}" --restart=Never --image="${kaniko_image}" --command -- sleep 3600
"${kubectl_cmd}" wait --for=condition=Ready "pod/${pod}" --timeout=3m
"${kubectl_cmd}" exec "${pod}" -- mkdir -p /kaniko/context
COPYFILE_DISABLE=1 tar \
  --exclude .git \
  --exclude node_modules \
  --exclude build \
  --exclude dist \
  --exclude data \
  --exclude .env \
  --exclude release-manifest.json \
  -cf - . | "${kubectl_cmd}" exec -i "${pod}" -- tar -xf - -C /kaniko/context
"${kubectl_cmd}" exec "${pod}" -- /kaniko/executor \
  --context=/kaniko/context \
  --dockerfile=/kaniko/context/Dockerfile \
  --destination="${push_image}" \
  --insecure \
  --insecure-registry="${registry_push}" \
  --skip-tls-verify

cat > release-manifest.json <<EOF
{
  "source_sha": "${source_sha}",
  "environment": "production",
  "image_tag": "${image_tag}",
  "registry_push": "${registry_push}",
  "registry_pull": "${registry_pull}",
  "image": "${pull_image}"
}
EOF

printf 'Pushed image:\n  %s\n' "${pull_image}"
