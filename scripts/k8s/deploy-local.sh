#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${IMAGE_TAG:-}" ]]; then
  printf 'IMAGE_TAG is required\n' >&2
  exit 2
fi

required_vars=(
  SQL_DATABASE_USER
  SQL_DATABASE_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "${var_name}" >&2
    exit 2
  fi
done

repo_root="$(git rev-parse --show-toplevel)"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
kubectl_cmd="${KUBECTL:-kubectl}"
namespace="papertrade-prod"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

mkdir -p "${tmp_dir}/infra"
cp -R "${repo_root}/infra/kubernetes" "${tmp_dir}/infra/kubernetes"
kustomization="${tmp_dir}/infra/kubernetes/overlays/prod/kustomization.yaml"

export IMAGE_TAG REGISTRY_PULL="${registry_pull}"
perl -0pi -e 's#newName: [^\n]*/p2ppsr/papertrade#newName: $ENV{REGISTRY_PULL}/p2ppsr/papertrade#g' "${kustomization}"
perl -0pi -e 's#newTag: [^\n]+#newTag: $ENV{IMAGE_TAG}#g' "${kustomization}"

secret_env_file="${tmp_dir}/papertrade-secrets.env"
umask 077
printf 'SQL_DATABASE_USER=%s\n' "${SQL_DATABASE_USER}" >> "${secret_env_file}"
printf 'SQL_DATABASE_PASSWORD=%s\n' "${SQL_DATABASE_PASSWORD}" >> "${secret_env_file}"
if [[ -n "${SERVER_PRIVATE_KEY:-}" ]]; then
  printf 'SERVER_PRIVATE_KEY=%s\n' "${SERVER_PRIVATE_KEY}" >> "${secret_env_file}"
fi

printf 'Deploying PaperTrade image tag %s\n' "${IMAGE_TAG}"
"${kubectl_cmd}" apply -f "${tmp_dir}/infra/kubernetes/base/namespace.yaml"
"${kubectl_cmd}" -n "${namespace}" create secret generic papertrade-secrets \
  --from-env-file="${secret_env_file}" \
  --dry-run=client \
  -o yaml | "${kubectl_cmd}" apply -f -
"${kubectl_cmd}" kustomize "${tmp_dir}/infra/kubernetes/overlays/prod" | "${kubectl_cmd}" apply -f -
"${kubectl_cmd}" -n "${namespace}" rollout status deployment/papertrade --timeout=15m
"${kubectl_cmd}" -n "${namespace}" wait --for=condition=Ready certificate/papertrade-tls --timeout=20m

curl_pod="papertrade-smoke-$(date +%s)"
"${kubectl_cmd}" -n "${namespace}" run "${curl_pod}" \
  --quiet \
  --rm \
  -i \
  --restart=Never \
  --image=curlimages/curl:8.11.1 \
  --command -- sh -ec '
    health="$(curl --fail --show-error --silent http://papertrade:8080/healthz)"
    printf "%s" "${health}" | grep -q "\"ok\":true"
    curl --fail --show-error --silent --output /dev/null http://papertrade:8080/
    curl --fail --show-error --silent http://papertrade:8080/api/status | grep -q "\"status\":\"success\""
  '

printf 'PaperTrade deployment completed for papertrade.metanet.app\n'
