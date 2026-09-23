# Runtime security review — 2026-09-23

Owner: `ty-everett`. Review deadline: **2026-09-30**. This is an explicit, short continuation of two existing no-fix exceptions, not a claim that the runtime has zero vulnerabilities.

The fresh Linux/amd64 candidate in [Runtime Image Security run 35909410070](https://github.com/p2ppsr/PaperTrade/actions/runs/35909410070) uses PR #15 head `151ff8ddb918f8eb0c7eb22dfc71198b75ceda0b` (GitHub test merge `93f6dd283ec609af7b2f88093f46310199fe8e4c`). Its retained Trivy report has zero fixable critical/high findings and two remaining critical occurrences. The other six old exception records no longer match a finding and are removed rather than extended.

| Finding | Exact installed version | Current vendor position |
| --- | --- | --- |
| [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) — libxml2 | `2.12.7+dfsg+really2.9.14-2.1+deb13u3` | Trixie vulnerable, minor/no-DSA, no fixed Trixie package. The tracker identifies the fix in the newer upstream entity-amplification rework. |
| [CVE-2026-54058](https://security-tracker.debian.org/tracker/CVE-2026-54058) — python3-pil | `11.1.0-5+deb13u4` | Trixie vulnerable, minor/no-DSA, no fixed Trixie package. Upstream Pillow 12.3.0 fixes the mapped-row-stride defect. |

Trivy's critical labels come from NVD. The Debian assessment is additional evidence, not a scanner dismissal. Stable-vendor updates are already installed by the runtime build; mixing testing/unstable distribution libraries or carrying the broad libxml2 parser/structure rework would require a separately qualified runtime migration. Pillow's upstream C-level fix also requires rebuilding and validating the Python imaging dependency used by the document tools. Neither change is hidden inside a wallet SDK update.

Authenticated authors can upload files for their own publications; administrators have a separate authorized upload route. PDF, docx and EPUB are the supported conversion inputs. Conversion runs in subprocesses with 30–120 second timeouts. Production source specifies non-root UID/GID 1000, dropped capabilities, RuntimeDefault seccomp, no privilege escalation, no service-account token mount, and resource limits. These controls limit impact but do not prove isolation from malicious document content. In particular, embedded images in EPUB/docx mean that absence of a direct McIdas upload route is not proof of non-reachability.

The two exceptions remain exact CVE/package/version matches. Fixable critical/high findings, any new critical finding, expired records, and stale records still fail the unchanged policy. Remove each exception as soon as a compatible vendor fix is available and the rebuilt image passes. Reassess by the deadline if no fix is available; do not extend automatically. No production rollout is recorded by this review.
