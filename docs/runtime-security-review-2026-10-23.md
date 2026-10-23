# Runtime security review — 2026-10-23

Owner: `ty-everett`. Explicit operator approval: **2026-10-23**. Deadline: **end of 2026-10-23 UTC**. OS remediation remains open.

The operator approved only the following six exact CVE/package/version tuples so the Node.js 24.22.1 security update can proceed through the normal image policy and guarded production promotion. Both currently serving Pods contain these same package versions. This records acceptance of existing OS risk for this short window, not a clean OS scan or full remediation.

| Package | Exact installed version | Findings |
| --- | --- | --- |
| libxml2 | `2.12.7+dfsg+really2.9.14-2.1+deb13u3` | CVE-2026-6653 |
| python3-pil | `11.1.0-5+deb13u4` | CVE-2026-54058, CVE-2026-112393, CVE-2026-112403, CVE-2026-112900, CVE-2026-96639 |

Authenticated document conversion can reach malformed embedded images and XML. Native memory corruption, code execution, disclosure and denial-of-service risks remain; the non-root, resource-limited container and conversion timeouts do not eliminate them. Debian Trixie has no compatible published fix for these exact packages. Upstream Pillow fixes and libxml2 parser changes require a separately qualified runtime update. Moving to an unsupported scanner distribution or mixing distribution packages is not authorized by this exception.

The unchanged policy requires an exact CVE/package/version match, a current date, and no stale exceptions. New critical findings, changed package versions, any fixable critical/high finding, or expiry still fail. The previous failed image-security run [39909453841](https://github.com/p2ppsr/PaperTrade/actions/runs/39909453841) remains failed evidence. The prior September review is retained. Every new candidate and the exact production digest must be scanned; source tests, canary, storage/identity, authenticated non-spending challenges, availability and withdrawal gates remain mandatory. This approval does not authorize a payment or additional paid test.

Remove each exception as soon as its fixed package is qualified. If no compatible fix is available by the deadline, the exceptions expire; do not renew automatically. Track the remaining OS remediation separately from Node deployment completion.

Primary vendor references: [libxml2](https://security-tracker.debian.org/tracker/CVE-2026-6653), [Pillow](https://security-tracker.debian.org/tracker/source-package/pillow).
