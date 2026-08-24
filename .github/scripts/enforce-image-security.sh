#!/usr/bin/env bash
set -euo pipefail

report_file="${1:-trivy-image.json}"
allowlist_file="${2:-.github/security/trivy-critical-allowlist.json}"
policy_date="${SECURITY_POLICY_DATE:-$(date -u +%F)}"
summary_file="${GITHUB_STEP_SUMMARY:-/dev/null}"

if [[ ! -s "$report_file" || ! -s "$allowlist_file" ]]; then
  echo "Image security policy input is missing" >&2
  exit 2
fi

jq -e '
  type == "array" and length > 0 and
  all(.[];
    (.vulnerability | test("^CVE-[0-9]{4}-[0-9]+$")) and
    (.package | type == "string" and length > 0) and
    (.installed_version | type == "string" and length > 0) and
    (.reviewed_on | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) and
    (.expires | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) and
    (.expires >= .reviewed_on) and
    (.rationale | type == "string" and length >= 40) and
    (.source | test("^https://security-tracker\\.debian\\.org/tracker/CVE-"))) and
  ([.[] | [.vulnerability, .package, .installed_version] | join("|")] |
    length == (unique | length))
' "$allowlist_file" >/dev/null

policy_json="$(jq -n \
  --slurpfile report "$report_file" \
  --slurpfile allowlist "$allowlist_file" \
  --arg today "$policy_date" '
  def findings: $report[0].Results[]?.Vulnerabilities[]?;
  def same_finding($finding; $exception):
    $exception.vulnerability == $finding.VulnerabilityID and
    $exception.package == $finding.PkgName and
    $exception.installed_version == $finding.InstalledVersion;
  def compact_finding:
    {
      vulnerability: .VulnerabilityID,
      package: .PkgName,
      installed_version: .InstalledVersion,
      fixed_version: (.FixedVersion // ""),
      status: (.Status // "unknown")
    };
  {
    critical: [findings | select(.Severity == "CRITICAL")] | length,
    high: [findings | select(.Severity == "HIGH")] | length,
    fixable_critical: [
      findings |
      select(.Severity == "CRITICAL" and ((.FixedVersion // "") | length > 0)) |
      compact_finding
    ],
    fixable_high: [
      findings |
      select(.Severity == "HIGH" and ((.FixedVersion // "") | length > 0)) |
      compact_finding
    ],
    unexpected_critical: [
      findings |
      select(.Severity == "CRITICAL") as $finding |
      select([
        $allowlist[0][] |
        select(same_finding($finding; .) and .expires >= $today)
      ] | length == 0) |
      compact_finding
    ],
    expired_exceptions: [
      $allowlist[0][] | select(.expires < $today) |
      {vulnerability, package, installed_version, expires}
    ],
    stale_exceptions: [
      $allowlist[0][] as $exception |
      select([
        findings | select(same_finding(.; $exception))
      ] | length == 0) |
      $exception | {vulnerability, package, installed_version, expires}
    ]
  }
')"

critical="$(jq -r '.critical' <<<"$policy_json")"
high="$(jq -r '.high' <<<"$policy_json")"
fixable_critical="$(jq -r '.fixable_critical | length' <<<"$policy_json")"
fixable_high="$(jq -r '.fixable_high | length' <<<"$policy_json")"
unexpected_critical="$(jq -r '.unexpected_critical | length' <<<"$policy_json")"
expired_exceptions="$(jq -r '.expired_exceptions | length' <<<"$policy_json")"
stale_exceptions="$(jq -r '.stale_exceptions | length' <<<"$policy_json")"

{
  echo "### PaperTrade runtime image security"
  echo
  echo "- Policy date: ${policy_date}"
  echo "- Critical occurrences: ${critical}"
  echo "- High occurrences: ${high}"
  echo "- Fixable critical occurrences: ${fixable_critical}"
  echo "- Fixable high occurrences: ${fixable_high}"
  echo "- Unexpected or expired critical occurrences: ${unexpected_critical}"
  echo "- Expired exception records: ${expired_exceptions}"
  echo "- Stale exception records: ${stale_exceptions}"
} >>"$summary_file"

if (( fixable_critical > 0 || fixable_high > 0 || unexpected_critical > 0 ||
      expired_exceptions > 0 || stale_exceptions > 0 )); then
  echo "Runtime image policy failed" >&2
  jq '{fixable_critical, fixable_high, unexpected_critical, expired_exceptions, stale_exceptions}' \
    <<<"$policy_json" >&2
  exit 1
fi

echo "Runtime image policy passed: critical=${critical} high=${high} exceptions=${critical}"
