# ProofRun Record: PaperTrade/wallet failure recovery

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-wallet-failure-recovery.proofrun.yaml`
- Run ID: `20260628T032540Z-wallet-failure-recovery`
- Started at: `2026-06-28T03:25:40Z`
- Completed at: `2026-06-28T03:29:40Z`
- Outcome: `fail`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Repo: `p2ppsr/PaperTrade`
- Workspace: `/Users/tyeverett/projects/PaperTrade`
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Target audience: reader who lacks a supported wallet, denies a wallet request, or experiences a recoverable wallet failure
- Flow category: `recovery`
- State changing: `false`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit: `302d68d`
- Product run-record baseline commit: `6d306d8`
- Branch: `master`
- Workflow run: `28309579698`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:302d68d1358d-production-2026-06-28`
- Image digest: `sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- Pod: `papertrade-5d96b86596-8gxbd`
- Pod status: `1/1 Running`, restarts `0`, node `server4`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | Safari controlled through safaridriver | fail | Safari was not a clean no-wallet context; `WalletClient("auto")` reached an existing wallet substrate. |
| Desktop wallet | Metanet Client desktop wallet substrate | fail | A fresh paid page access completed without an operator-visible denial opportunity during this run. |
| Server wallet | PaperTrade server wallet | fail | Production accounting state changed during a zero-spend recovery flow. |
| Network | mainnet production | fail | A real `25 sats` payment was created. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Production health | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| Public status | `curl -fsS https://papertrade.metanet.app/api/status` | pass | `mode:"public_submissions"`, `pricePerPageSats:25`. |
| Public catalog | `curl -fsS https://papertrade.metanet.app/api/publications` | pass | Starter catalog returned the selected publications. |
| Unauthorized paid page behavior | unauthenticated API request for page 2 | pass | Returned HTTP `401` with `Authenticate with a BRC100 wallet to read paid pages`. |
| Candidate unowned page | production DB before-state query | pass | `Grimms Fairy Tales` page 2 had `0` payments and `0` entitlements before the denial branch attempt. |
| Wallet permission baseline | wallet app permission state for `papertrade.metanet.app` | blocked | Not captured before opening the unowned paid page. A pre-existing payment, basket, protocol, PACT, certificate, or manifest-derived permission may have allowed the wallet action to complete without a fresh denial opportunity. |
| Spend cap | flow definition and DB baseline | fail | Flow spend cap was `0 sats`; one new payment was created. |

## Step Results

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Missing-wallet browser | Clean browser with no supported wallet substrate shows wallet guidance and creates no payment. | Safari rendered already-owned `Pride and Prejudice` page 2 successfully. Telemetry showed `walletSubstrate:"auto"`, `wallet.prompt_shown`, `wallet.action_succeeded`, and `reader.owned_page_accessed`. | blocked | ~2s |
| 2. Deny wallet prompt | Operator denies/cancels wallet prompt; app shows recoverable failure; no payment, entitlement, or ledger row is created. | Opening unowned `Grimms Fairy Tales` page 2 rendered the page and created a production payment, entitlement, author payable ledger row, and platform commission ledger row. The wallet permission baseline was not captured, so this proves the run violated its zero-spend cap, but it does not prove the app or wallet skipped a required prompt. | fail | `2118 ms` wallet action |
| 3. Timeout wallet request | Controlled timeout produces failure state and no accounting changes. | Not executed after the zero-spend safety boundary was violated. | not run | n/a |
| 4. Recover with valid wallet | Retry starts from clean state and does not charge unless explicitly transferred to the paid-page purchase ProofRun. | Not executed after the zero-spend safety boundary was violated. | not run | n/a |

## Accidental Accounting State

- Publication: `Grimms Fairy Tales`
- Publication ID: `5d0c3c44-0b3f-4b1a-94b4-000000000010`
- Page: `2`
- New payment ID: `5eeda725-965c-42d6-a870-1364641fb6ac`
- New entitlement ID: `70`
- Payment amount: `25 sats`
- Ledger rows:
  - `author_payable`: `23 sats`
  - `platform_commission`: `2 sats`
- Created at: `2026-06-28T03:29:19Z`

## Assertions

### UI And Appearance

- Result: `fail`
- Evidence: The missing-wallet branch could not be validated in Safari because the browser had access to a wallet substrate. During the unowned-page branch, the page rendered as unlocked instead of showing a denied/cancelled failure state.

### Intuitiveness For Target Audience

- Result: `fail`
- Evidence: The action label recorded in telemetry was `load paid page access`, which does not clearly communicate payment consequence. The operator did not capture whether a pre-existing PaperTrade payment, basket, protocol, PACT, certificate, or manifest-derived permission could auto-complete the action, so prompt/denial behavior is not conclusively diagnosed.

### Customer Trust

- Result: `fail`
- Evidence: A recovery flow with a `0 sats` spend cap created a real payment. This violates the trust assertion that the reader is never left wondering whether a payment happened.

### Flow Success

- Result: `fail`
- Evidence:
  - New payments after baseline: `1`
  - New entitlements after baseline: `1`
  - New ledger rows after baseline: `2`
  - New ledger total after baseline: `25 sats`

### Telemetry And Observability

- Result: `fail`
- Evidence:
  - `wallet.prompt_shown`: `1`
  - `wallet.action_succeeded`: `1`
  - `reader.paid_page_unlocked`: `1`
  - `wallet.action_failed`: `0`
  - `reader.paid_page_failed`: `0`
  - `reader.paid_page_unlocked` included `accessMode:"paid"` and `chargeRequired:true`.

### Reliability And Repeatability

- Result: `fail`
- Evidence: The missing-wallet branch was not repeatable with Safari on this Mac because Safari was not a clean no-wallet environment. The denial branch could not be completed safely because it created payment state.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| Missing-wallet guidance appears | 10s | Did not appear; owned page rendered | fail |
| Denied prompt recovery appears | 15s | Did not appear; paid page unlocked | fail |
| Wallet action result | no success unless transferred to purchase ProofRun | `wallet.action_succeeded` in `2118 ms` | fail |
| Telemetry visible | 60s | Events visible in production `client_events` during run window | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260628T032540Z-papertrade-wallet-failure-recovery.md`
- Missing-wallet attempt: Safari reached existing wallet substrate and rendered an owned page.
- Denial attempt: `Grimms Fairy Tales`, publication `5d0c3c44-0b3f-4b1a-94b4-000000000010`, page `2`, created payment `5eeda725-965c-42d6-a870-1364641fb6ac`.
- Sanitized DB result: one new payment, one new entitlement, and two new ledger rows totaling `25 sats`.
- Sanitized telemetry result: success/unlock telemetry emitted; failure telemetry did not emit.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T032540Z-wallet-failure-recovery/`

- `01-safari-missing-wallet.png`
- `02-safari-unowned-page-before-denial.png`
- `desktop-before-denial.png`
- `desktop-after-unowned-request.png`
- `before-db.tsv`
- `grimm-page2-before.tsv`
- `after-unowned-render-db-telemetry.tsv`
- `safari-missing-wallet.json`
- `safari-unowned-before-denial.json`
- `safari-render-telemetry.tsv`
- `healthz.json`
- `status.json`
- `publications.json`
- `deploy-wide.txt`
- `pods-wide.txt`
- `pod-logs-before.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| critical | Wallet failure recovery ProofRun created a real production payment despite `stateChanging:false` and `spendCap:0 sats`. | PaperTrade + wallet substrate | Add an operator-safe spend guard for recovery testing and confirm/revoke the wallet permission baseline before rerunning this flow. |
| high | Safari on this Mac is not a clean no-wallet browser context; SDK `auto` can reach a wallet substrate even without the browser extension visible. | ProofRun procedure | Define a verified no-wallet harness or browser profile for missing-wallet branches, and assert no wallet bridge before opening paid pages. |
| high | The ProofRun did not capture the wallet permission baseline before interpreting prompt behavior. A pre-existing PaperTrade payment, basket, protocol, PACT, certificate, or manifest-derived permission may have allowed the action to complete without a fresh prompt. | ProofRun procedure | Require wallet permission baseline capture/revocation before all wallet-backed prompt, denial, timeout, and zero-spend recovery assertions. |
| high | Fresh paid page access completed during a zero-spend recovery flow. Root cause remains unproven until wallet permissions are inspected. | PaperTrade + wallet substrate | Re-run only after revoking/isolation confirms no standing spend permission, then verify the visible denial/cancel path. |
| medium | Telemetry action text `load paid page access` obscures that a paid conversion may occur. | PaperTrade | Rename or enrich the action context so paid-page purchase risk is explicit in UserCom and run records. |

## Readiness Impact

- Commercial readiness changed: `yes`
- Previous tier: `needs ProofRun execution`
- New tier: `needs ProofRun execution`
- Registry update needed: `yes`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/wallet-failure-recovery
Outcome: fail
Environment: production
Commit/deploy: PaperTrade 302d68d; image 302d68d1358d-production-2026-06-28; digest sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Safari automation plus existing Metanet Client desktop wallet substrate
Failure evidence: the supposed missing-wallet Safari context had walletSubstrate auto and rendered an owned page; opening unowned Grimms Fairy Tales page 2 then created payment 5eeda725-965c-42d6-a870-1364641fb6ac, entitlement 70, and 25 sats of ledger rows; wallet permission baseline was not captured, so prompt-skipping is not proven
Trust/UX findings: this was a zero-spend recovery ProofRun, so the unexpected production payment is a critical blocker
Telemetry/log evidence: wallet.prompt_shown, wallet.action_succeeded, and reader.paid_page_unlocked emitted; wallet.action_failed and reader.paid_page_failed did not emit
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T032540Z-wallet-failure-recovery/
Next action: inspect/revoke PaperTrade wallet permission baseline across payments, baskets, protocols/grouped protocols, PACT, certificates, and manifest-derived grants or use an isolated wallet/profile, then rerun this flow before continuing wallet failure/recovery coverage
```
