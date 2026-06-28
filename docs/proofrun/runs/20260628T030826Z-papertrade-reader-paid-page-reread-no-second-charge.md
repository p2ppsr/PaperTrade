# ProofRun Record: PaperTrade/reader paid page reread and no second charge

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-paid-page-reread-no-second-charge.proofrun.yaml`
- Run ID: `20260628T030826Z-papertrade-reader-paid-page-reread-no-second-charge-pass`
- Started at: `2026-06-28T03:08:26Z`
- Completed at: `2026-06-28T03:10:39Z`
- Outcome: `pass`
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

- Source commit: `302d68d`
- Branch: `master`
- Workflow run: `28309579698`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:302d68d1358d-production-2026-06-28`
- Image digest: `sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- Pod: `papertrade-5d96b86596-8gxbd`
- Pod status: `1/1 Running`, restarts `0`, node `server4`
- Frontend asset observed in Chrome: `https://papertrade.metanet.app/assets/index-C_GCMoQv.js`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | Chrome controlled through the operator's existing profile | pass | Owned page rendered by direct link, reload, history navigation, and fresh deep link. |
| Desktop wallet | Metanet Client desktop wallet substrate | pass | Authenticated access checks completed; no payment approval was requested. |
| Server wallet | PaperTrade server wallet | pass | No new payment, entitlement, or ledger row was created. |
| Network | mainnet production | pass | Zero-spend reread preserved the previous entitlement. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree and deploy target | Git + GitHub Actions + Kubernetes | pass | Commit `302d68d` deployed by run `28309579698`; rollout completed. |
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

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Open owned page directly | Owned paid page renders or asks only for identity/access proof. | `/read/5d0c3c44-0b3f-4b1a-94b4-000000000005/2` rendered an image with `alt="Rendered page 2"`. | pass | `1167 ms` |
| 2. Approve auth if needed | No payment or spend request is made. | Authenticated wallet GET requests completed; no new payment was created. | pass | `reader.owned_page_accessed` visible immediately after access checks. |
| 3. Verify owned page renders after reload | Page image renders after reload; no duplicate side effects. | Reload rendered the same owned page image. | pass | `600 ms` |
| 4. Exercise navigation/history | Back, forward, and fresh deep link stay responsive. | Publication detail, browser back to owned page, forward to detail, and fresh deep link all worked. | pass | Back to owned page `42 ms`; fresh deep link `602 ms`. |
| 5. Verify telemetry and no second charge | Telemetry distinguishes owned reread from fresh conversion. | `reader.owned_page_accessed` emitted with `accessMode:"owned"` and `chargeRequired:false`; `reader.paid_page_unlock_started` and `reader.paid_page_unlocked` were absent. | pass | Events visible inside the run window. |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Screenshots show direct owned page rendering, reload rendering, publication detail, history back/forward, and final fresh deep-link rendering.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: The reader reached the page without visible second-payment copy, stale wallet help, or a stuck loading state.

### Customer Trust

- Result: `pass`
- Evidence: Before/after production DB checks showed payment count stayed `1`, entitlement count stayed `1`, and ledger rows stayed `2` totaling `25 sats`.

### Flow Success

- Result: `pass`
- Evidence:
  - New payments after baseline: `0`
  - New entitlements after baseline: `0`
  - New ledger rows after baseline: `0`
  - Production pod logs showed only normal startup/seed messages.

### Telemetry And Observability

- Result: `pass`
- Evidence:
  - `reader.paid_page_access_started`: `3`
  - `reader.owned_page_accessed`: `3`
  - `reader.paid_page_unlock_started`: `0`
  - `reader.paid_page_unlocked`: `0`
  - `reader.owned_page_accessed` context includes `accessMode:"owned"` and `chargeRequired:false`.

### Reliability And Repeatability

- Result: `pass`
- Evidence: Owned access rendered by direct open, reload, browser history, and fresh deep link.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| Direct owned-page render | 10s | `1167 ms` | pass |
| Reload owned-page render | 10s | `600 ms` | pass |
| History back to owned page | 10s | `42 ms` | pass |
| Final fresh deep link render | 10s | `602 ms` | pass |
| Telemetry visible | 60s | Events visible in production `client_events` during run window | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260628T030826Z-papertrade-reader-paid-page-reread-no-second-charge.md`
- Target: `The Wonderful Wizard of Oz`, publication `5d0c3c44-0b3f-4b1a-94b4-000000000005`, page `2`.
- Sanitized DB result: before/after payment, entitlement, and ledger counts were unchanged.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T030826Z-reader-paid-page-reread-no-second-charge-pass/`

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
- `pod-logs-before.txt`
- `pod-logs-after.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| none | The previous warning was fixed. Owned rereads now emit owned/no-charge telemetry and do not emit paid conversion events. | PaperTrade | Continue with the next ProofRun flow. |

## Readiness Impact

- Commercial readiness changed: `yes`
- Previous tier: `needs telemetry hardening`
- New tier: `needs ProofRun execution`
- Registry update needed: `yes`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/reader-paid-page-reread-no-second-charge
Outcome: pass
Environment: production
Commit/deploy: PaperTrade 302d68d; image 302d68d1358d-production-2026-06-28; digest sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Chrome desktop plus existing Metanet Client wallet substrate
Success evidence: owned page 2 rendered by direct link, reload, history back, and fresh deep link; no second payment, entitlement, or ledger row was created
Trust/UX findings: owned reread is fast and does not show second-charge copy
Telemetry/log evidence: reader.owned_page_accessed emitted with accessMode owned and chargeRequired false; reader.paid_page_unlock_started and reader.paid_page_unlocked were absent; pod logs normal startup/seed only
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T030826Z-reader-paid-page-reread-no-second-charge-pass/
Next action: proceed to papertrade-wallet-failure-recovery
```
