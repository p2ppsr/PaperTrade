# ProofRun Record: PaperTrade/reader paid page reread and no second charge

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-paid-page-reread-no-second-charge.proofrun.yaml`
- Run ID: `20260628T024008Z-papertrade-reader-paid-page-reread-no-second-charge`
- Started at: `2026-06-28T02:40:08Z`
- Completed at: `2026-06-28T02:43:41Z`
- Outcome: `warn`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Repo: `p2ppsr/PaperTrade`
- Workspace: `/Users/tyeverett/projects/PaperTrade`
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Target audience: returning reader who already paid for a page and expects access to persist without being charged again
- Flow category: `redeem`
- State changing: `yes`
- Spend cap: `0 sats`

## Deployment Identity

- Product repo head at run-record start: `c7979a5`
- Branch: `master`
- Live image: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:c4ac557821f0-production-2026-06-27`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- Pod: `papertrade-86db5fcf6-g9585`
- Pod status: `1/1 Running`, restarts `0`, node `server4`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | Chrome controlled through the operator's existing profile | warn | Owned page rendered by direct link, reload, history navigation, and fresh deep link. |
| Desktop wallet | Metanet Client desktop wallet | warn | No payment approval was requested; authenticated wallet GET requests completed. Telemetry copy still labels the action as `unlock this page`. |
| Server wallet | PaperTrade server wallet | pass | No new payment, entitlement, or ledger row was created. |
| Network | mainnet production | pass | Zero-spend reread preserved the previous entitlement. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree clean | `git status --short --branch` | pass | PaperTrade and network-ops were clean before the new run evidence. |
| Health endpoint | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| Public status | `curl -fsS https://papertrade.metanet.app/api/status` | pass | `mode:"public_submissions"`, `pricePerPageSats:25`. |
| Public catalog | `curl -fsS https://papertrade.metanet.app/api/publications` | pass | Starter catalog returned the selected publication. |
| Existing entitlement | production DB before-state query | pass | One existing entitlement for the selected reader/publication/page. |
| Spend cap | flow definition and DB comparison | pass | Cap was `0 sats`; no new accounting rows were allowed. |

## Target Entitlement

- Publication: `The Wonderful Wizard of Oz`
- Publication ID: `5d0c3c44-0b3f-4b1a-94b4-000000000005`
- Page: `2`
- Existing payment ID: `c06645ca-6acb-4425-a8ff-eece8bd9084f`
- Existing entitlement ID: `67`
- Reader identity: `02a064784ebb435e87c3961745b01e3564d41149ea1291d1a73783d1b7b3a7a220`

## Step Results

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| 1. Open owned page directly | Owned paid page renders or asks only for identity/access proof. | `/read/5d0c3c44-0b3f-4b1a-94b4-000000000005/2` rendered an image with `alt="Rendered page 2"` and natural size `1224x1584`. | pass |
| 2. Approve auth if needed | No payment or spend request is made. | Wallet-authenticated GET requests completed in roughly `679 ms`, `117 ms`, `85 ms`, and `171 ms`; no new payment was created. | pass |
| 3. Verify owned page renders after reload | Page image renders after reload; no duplicate side effects. | Reload rendered the same owned page image. | pass |
| 4. Exercise navigation/history | Back, forward, and fresh deep link stay responsive. | Correct publication route `/publication/:id`, browser back to owned page, forward to detail, and fresh deep link all worked. | pass |
| 5. Verify telemetry and no second charge | Telemetry distinguishes owned reread from fresh conversion. | Accounting passed, but telemetry emitted `reader.paid_page_unlock_started` and `reader.paid_page_unlocked` four times without context indicating owned reread/no-charge. | warn |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Screenshots show direct owned page rendering, reload rendering, publication detail, history back/forward, and final fresh deep-link rendering.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: The reader reached the page without visible second-payment copy or a stuck loading state.

### Customer Trust

- Result: `pass`
- Evidence: Before/after production DB checks showed payment count stayed `1`, entitlement count stayed `1`, and ledger rows stayed `2` totaling `25 sats`.

### Flow Success

- Result: `pass`
- Evidence:
  - New payments after baseline: `0`
  - New entitlements after baseline: `0`
  - New ledger rows after baseline: `0`
  - Production pod logs before/after were empty.

### Telemetry And Observability

- Result: `warn`
- Evidence:
  - `reader.paid_page_unlock_started`: `4`
  - `reader.paid_page_unlocked`: `4`
  - `wallet.prompt_shown`: `4`
  - `wallet.action_succeeded`: `4`
  - Event context identifies `page:paid`, `action:"unlock this page"`, and `cache:miss`, but does not identify the request as an already-owned reread or no-charge access.
- Commercial-readiness impact: analytics may overcount returning-reader entitlement checks as paid-page conversion activity.

### Reliability And Repeatability

- Result: `pass`
- Evidence: Owned access rendered by direct open, reload, browser history, and fresh deep link.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| Auth/access request completion | 10s | `679 ms`, `117 ms`, `85 ms`, `171 ms` observed in telemetry | pass |
| History back to owned page | 10s | `48 ms` observed by browser automation | pass |
| Final fresh deep link terminal render | 10s | `55 ms` after transient loading state | pass |
| Telemetry visible | 60s | Events visible in production `client_events` during run window | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260628T024008Z-papertrade-reader-paid-page-reread-no-second-charge.md`
- Target: `The Wonderful Wizard of Oz`, publication `5d0c3c44-0b3f-4b1a-94b4-000000000005`, page `2`.
- Sanitized DB result: before/after payment, entitlement, and ledger counts were unchanged.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T024008Z-reader-paid-page-reread-no-second-charge/`

- `browser-observations.json`
- `01-direct-open.png`
- `02-reload-owned-page.png`
- `03-publication-detail.png`
- `04-history-back-to-owned-page.png`
- `05-history-forward-to-publication-detail.png`
- `06-fresh-deep-link-return.png`
- `before-db.tsv`
- `after-db.tsv`
- `after-client-events.tsv`
- `telemetry-context.tsv`
- `wallet-telemetry-context.tsv`
- `pod-logs-before.txt`
- `pod-logs-after.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| medium | Owned-page rereads emit paid conversion-shaped events: `reader.paid_page_unlock_started`, `reader.paid_page_unlocked`, `wallet.prompt_shown`, and `wallet.action_succeeded` with `action:"unlock this page"` even when the server creates no payment, entitlement, or ledger row. | PaperTrade | Add explicit owned/reread/no-charge semantics to the page access response and telemetry, or emit separate `reader.owned_page_access_started` / `reader.owned_page_accessed` events. |

## Readiness Impact

- Commercial readiness changed: `yes`
- Previous tier: `needs ProofRun execution`
- New tier: `needs telemetry hardening`
- Registry update needed: `no`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/reader-paid-page-reread-no-second-charge
Outcome: warn
Environment: production
Commit/deploy: product repo head c7979a5; live image c4ac557821f0-production-2026-06-27; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Chrome desktop plus existing Metanet Client wallet substrate
Success evidence: owned page 2 rendered by direct link, reload, history back, and fresh deep link; no second payment, entitlement, or ledger row was created
Trust/UX findings: UI/accounting path is safe, but telemetry labels rereads as paid unlock activity
Telemetry/log evidence: reader.paid_page_unlock_started and reader.paid_page_unlocked each emitted 4 times with no owned/no-charge distinction; pod logs empty
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T024008Z-reader-paid-page-reread-no-second-charge/
Next action: fix telemetry semantics before treating reread/no-second-charge as a readiness pass
```
