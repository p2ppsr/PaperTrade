# ProofRun Record: PaperTrade/reader paid page purchase

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-paid-page-purchase.proofrun.yaml`
- Run ID: `20260628T020857Z-papertrade-reader-paid-page-purchase`
- Started at: `2026-06-28T02:08:57Z`
- Completed at: `2026-06-28T02:17:20Z`
- Outcome: `pass`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Repo: `p2ppsr/PaperTrade`
- Workspace: `/Users/tyeverett/projects/PaperTrade`
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Target audience: reader with a wallet substrate trying to continue after the free first page
- Flow category: `pay`
- State changing: `yes`
- Spend cap: `100 sats`

## Deployment Identity

- Source commit: `3e74b2a`
- Branch: `master`
- Workflow run: `28298423945`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:c4ac557821f0-production-2026-06-27`
- Image digest: `sha256:9e2a7423acbc697f28eef342b2953b84605566f71675555af722e62b8e5fad46`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- Other release identity: pod `papertrade-86db5fcf6-g9585`, node `server4`, ready `1/1`, restarts `0`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | Chrome controlled through the operator's existing profile | pass | Detail, free page, paid pending state, and paid page success were captured. |
| Desktop wallet | Metanet Client desktop wallet | pass | Approval popup appeared in the desktop wallet window. The first operator pass missed that separate window; after approval the payment completed. |
| Server wallet | PaperTrade server wallet | pass | Payment was accepted, entitlement created, and ledger split was recorded. |
| Network | mainnet production | pass | Low-value production purchase completed under the configured cap. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree clean | `git status --short --branch` | pass | `## master...origin/master` before recording run files. |
| Health endpoint | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| Public status | `curl -fsS https://papertrade.metanet.app/api/status` | pass | `mode:"public_submissions"`, `pricePerPageSats:25`. |
| Public catalog | `curl -fsS https://papertrade.metanet.app/api/publications` | pass | 10 publications. |
| Candidate page | DB entitlement check and catalog | pass | Selected `The Wonderful Wizard of Oz`, publication `5d0c3c44-0b3f-4b1a-94b4-000000000005`, page `2`; no existing entitlement was present before purchase. |
| Spend cap confirmed | status + flow definition | pass | Price was `25 sats`, cap was `100 sats`. |
| Baseline payments | production DB query before run | pass | Recent payments saved before the attempt. |

## Step Results

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Open free page | Free page is visible before payment. | Detail and page 1 rendered for `The Wonderful Wizard of Oz`; page 1 image was visible. | pass | Within observed browser wait. |
| 2. Start paid unlock | Page 2 unlock starts with immediate progress and wallet/payment explanation. | Page 2 showed `Unlocking page...`; telemetry emitted `reader.paid_page_unlock_started` and `wallet.prompt_shown`; desktop wallet popup appeared outside Chrome. | pass | Prompt event emitted within seconds. |
| 3. Approve wallet payment | Wallet shows understandable amount/action and returns success. | Metanet Client approval completed a `25 sats` purchase. | pass | Operator delay occurred because the first check missed the desktop wallet window. |
| 4. Verify paid page | Page 2 image renders and payment/entitlement/ledger state is created. | Page 2 rendered as `Rendered page 2`; payment `c06645ca-6acb-4425-a8ff-eece8bd9084f` was accepted; entitlement and ledger entries were created. | pass | Confirmation occurred after wallet approval. |
| 5. Verify logs and telemetry | No unexpected errors; conversion sequence queryable. | Production pod logs were empty. Telemetry included `wallet.action_succeeded`, `reader.paid_page_unlocked`, and supporting wallet request/method events. | pass | Events visible in production DB. |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Chrome screenshots show the publication detail, free page, pending paid unlock state, and final page 2 success state.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: Detail page shows `25 sats per paid page`; wallet approval happened in Metanet Client; final reader state returned to normal page navigation.
- Note: Future ProofRun operators must inspect the desktop wallet window, not only Chrome tabs, when `wallet.prompt_shown` is emitted.

### Customer Trust

- Result: `pass`
- Evidence: No duplicate payment was recorded. The final state rendered the paid page and normal navigation after approval.
- Follow-up: Browser pending copy could be clearer by saying to approve in Metanet Client/Desktop Wallet when a desktop wallet substrate is active.

### Flow Success

- Result: `pass`
- Evidence: Payment row, entitlement row, paid page rendering, and ledger split agree:
  - Payment id: `c06645ca-6acb-4425-a8ff-eece8bd9084f`
  - Amount: `25 sats`
  - Author payable: `23 sats`
  - Platform commission: `2 sats`
  - Reader identity: `02a064784ebb435e87c3961745b01e3564d41149ea1291d1a73783d1b7b3a7a220`

### Telemetry And Observability

- Result: `pass`
- Observed events included: `reader.paid_page_unlock_started`, `wallet.prompt_shown`, `wallet.request_started`, `wallet.request_finished`, `wallet.action_succeeded`, `reader.paid_page_unlocked`, `reader.page_image_url_fetch_finished`.
- Log checks: Production pod logs for the run window were empty.

### Reliability And Repeatability

- Result: `pass`
- Evidence: A fresh unowned page candidate created a new entitlement and then reloading the paid page rendered from owned access.
- Caveat: Repeat operators must keep Metanet Client visible or explicitly check it when wallet telemetry indicates a prompt.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| Wallet prompt shown | 5s | `wallet.prompt_shown` telemetry emitted quickly; prompt was in Metanet Client | pass |
| Approval to confirmation | 10s | After wallet approval, payment and page unlock completed in the run window | pass |
| Full flow duration | 45s | Product path completed; elapsed run was longer because the operator initially missed the desktop wallet popup | pass |
| Telemetry visible | 60s | Events visible in production `client_events`; payment/ledger/entitlement visible in production DB | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260628T020857Z-papertrade-reader-paid-page-purchase.md`
- Candidate: `The Wonderful Wizard of Oz`, publication `5d0c3c44-0b3f-4b1a-94b4-000000000005`, page `2`, price `25 sats`.
- Sanitized DB result: payment, ledger, and entitlement rows exist for the candidate page.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T020857Z-reader-paid-page-purchase/`

- `chrome-observations.json`
- `01-detail.png`
- `02-page-1-free.png`
- `03-page-2-paid-attempt.png`
- `04-page-2-after-timeout.png`
- `05-page-2-success-reread.png`
- `payments-before.json`
- `post-attempt-db.json`
- `final-db.json`
- `retry-with-wallet-front-db.json`
- `payment-success-db.json`
- `healthz.json`
- `status.json`
- `publications.json`
- `pod-logs-since-10m.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| low | Browser pending copy does not explicitly tell desktop-wallet users to check Metanet Client for the approval popup. | PaperTrade | Improve pending wallet copy/substrate guidance so users know where to approve. |
| low | The first operator pass falsely interpreted “no Chrome popup” as “no wallet popup.” | ProofRun procedure | Add a ProofRun operator note: when desktop wallet substrate is in scope, inspect the desktop wallet app/window before assigning failure. |

## Readiness Impact

- Commercial readiness changed: `yes`
- Previous tier: `needs ProofRun execution`
- New tier: `needs ProofRun execution`
- Registry update needed: `no`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/reader-paid-page-purchase
Outcome: pass
Environment: production
Commit/deploy: PaperTrade 3e74b2a; image c4ac557821f0-production-2026-06-27; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Chrome desktop plus Metanet Client desktop wallet
Success evidence: detail and page 1 rendered; desktop wallet approval completed; page 2 rendered; payment c06645ca-6acb-4425-a8ff-eece8bd9084f accepted for 25 sats
Trust/UX findings: no duplicate charge; entitlement created; browser pending copy should better direct desktop-wallet users to Metanet Client
Telemetry/log evidence: wallet.prompt_shown, wallet.action_succeeded, reader.paid_page_unlocked observed; payment/ledger/entitlement rows present; pod logs empty
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T020857Z-reader-paid-page-purchase/
Next action: run papertrade-reader-paid-page-reread-no-second-charge
```
