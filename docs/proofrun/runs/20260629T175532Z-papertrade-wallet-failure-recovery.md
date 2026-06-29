# ProofRun Record: PaperTrade wallet missing, denied, timeout, and recovery

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-wallet-failure-recovery.proofrun.yaml`
- Run ID: `20260629T175532Z-papertrade-wallet-failure-recovery`
- Started at: `2026-06-29T17:55:32Z`
- Completed at: `2026-06-29T18:02:00Z`
- Outcome: `blocked`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Flow category: `recovery`
- State changing: `false`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit deployed: `bc53f561d2f5fec29e942cd309fdd2304eb19ff8`
- Workflow runs: CI `28386213799`, deploy `28386316212`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:bc53f561d2f5-production-2026-06-29`
- Image digest: `sha256:697482f884e324b728fef4eb0ad23096a087fa8011f3984cc660443ed60901cc`
- Kubernetes pod: `papertrade-67d949b87f-wq6r9`, ready `1/1`, restarts `0`

## Device And Wallet Matrix

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Clean non-wallet browser | In-app Chrome automation | pass | Missing-wallet page 2 branch executed. |
| iOS Safari | iOS Simulator | pass | Device boot and PaperTrade page load captured. |
| Android Chrome / Android Emulator | `Medium_Phone_API_36.0` | blocked | Emulator did not stay attached for Android Chrome execution. |
| Desktop wallet / BSV Browser / local wallet bridge | Installed apps present | blocked | No inspectable permission baseline for PaperTrade origin/actions was available during this run. |
| Mobile wallet | Metanet Explorer Android | blocked | Android emulator instability blocked the mobile wallet/browser branch. |

## Step Results

| Step | Result | Timing | Evidence |
| --- | --- | ---: | --- |
| Missing-wallet browser | pass | `7070 ms` | Opening `/read/5d0c3c44-0b3f-4b1a-94b4-000000000001/2` showed `Wallet needed`, `Continue with a BRC100 wallet`, `Get Metanet`, `BSV Browser`, `Read page 1 free`, and `Retry`. |
| Deny wallet prompt | blocked | n/a | The required PaperTrade wallet permission baseline could not be inspected or reset, so denial could not be safely distinguished from standing approval or auto-completion. |
| Timeout wallet request | blocked | n/a | No controlled unavailable wallet bridge was executed after the baseline blocker. |
| Recover with valid wallet | blocked | n/a | Recovery with wallet would transition into the paid-page purchase flow and requires approved spend plus baseline. |

## Telemetry And Domain State

- Session id: `8c7559b68711c4d9cc3008c7`
- UserCom signals for page 2 included `reader.paid_page_access_started` id `2320132`, `wallet.prompt_shown` id `2320135`, `wallet.action_failed` id `2320141`, and `reader.paid_page_failed` id `2320144`.
- PaperTrade `client_events` included `wallet.request_failed`, `wallet.action_failed`, and `reader.paid_page_access_started` for page 2.
- Domain safety check for the run window showed `page_entitlements: 0`, `ledger_entries: 0`, `payments: 0`, and `payouts: 0`.

## Evidence

- Private artifacts: `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T175532Z-all-seven-sweep/`
- Screenshot: `wallet-failure-recovery/missing-wallet-page2.png`
- JSON/log artifacts: `usercom-query.json`, `papertrade-client-events.json`, `device-preflight/device-preflight.txt`, `device-preflight/android-emulator.log`, `device-preflight/android-emulator-retry.log`

## Readiness Impact

The missing-wallet branch passed and produced the right UX and telemetry with no payment side effects. The overall flow remains `blocked` because the denial, timeout, Android Chrome, and mobile-wallet branches require a provable permission baseline and stable Android/mobile-wallet substrate.

