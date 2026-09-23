#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
[[ "$(uname -sm)" == "Linux x86_64" ]] || { echo 'Scanner requires the Linux/amd64 runner' >&2; exit 2; }
[[ "${CANDIDATE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'A full candidate digest is required' >&2; exit 2; }
exact_image="${REGISTRY_PUSH:-registry.cars-operator-system.svc.cluster.local:5000}/p2ppsr/papertrade@${CANDIDATE_DIGEST}"
scanner_image='aquasec/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c'
work_dir="$(mktemp -d)"
scanner=''
cleanup() {
  rm -rf "$work_dir"
  if [[ -n "$scanner" ]]; then docker rm "$scanner" >/dev/null; fi
}
trap cleanup EXIT

docker pull "$exact_image"
docker save --output "$work_dir/papertrade.tar" "$exact_image"
# Extract the trusted binary without starting a container on the shared daemon.
# Its remote filesystem cannot mount the runner workspace, and the build-only
# daemon does not have a delegated user-session cgroup for container execution.
docker pull --platform linux/amd64 "$scanner_image"
scanner="$(docker create --platform linux/amd64 "$scanner_image")"
docker cp "$scanner:/usr/local/bin/trivy" "$work_dir/trivy"
chmod 0700 "$work_dir/trivy"
"$work_dir/trivy" --version
# Archive scanning needs neither production credentials nor Docker access.
env -u SQL_DATABASE_USER -u SQL_DATABASE_PASSWORD -u SERVER_PRIVATE_KEY \
  -u DOCKER_HOST -u DOCKER_CONFIG \
  "$work_dir/trivy" image --input "$work_dir/papertrade.tar" \
  --scanners vuln --format json --output trivy-production-image.json
.github/scripts/enforce-image-security.sh trivy-production-image.json
