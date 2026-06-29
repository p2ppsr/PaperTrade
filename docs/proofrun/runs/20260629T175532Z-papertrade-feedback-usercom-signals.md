# ProofRun Record: PaperTrade feedback and UserCom signal capture

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-feedback-usercom-signals.proofrun.yaml`
- Run ID: `20260629T175532Z-papertrade-feedback-usercom-signals`
- Started at: `2026-06-29T17:55:32Z`
- Completed at: `2026-06-29T18:02:00Z`
- Outcome: `warn`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Flow category: `feedback`
- State changing: `true`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit deployed: `bc53f561d2f5fec29e942cd309fdd2304eb19ff8`
- Workflow runs: CI `28386213799`, deploy `28386316212`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:bc53f561d2f5-production-2026-06-29`
- Image digest: `sha256:697482f884e324b728fef4eb0ad23096a087fa8011f3984cc660443ed60901cc`
- Kubernetes pod: `papertrade-67d949b87f-wq6r9`, ready `1/1`, restarts `0`

## Device Matrix

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | In-app Chrome automation, 1280x720 | pass | Newsstand modal, Help embedded form, and reader modal covered. |
| Mobile browser | iOS Safari on simulator | pass | PaperTrade loaded in real iOS Safari screenshot. |
| Mobile viewport | Browser viewport `390x844` | pass | Feedback and reader layout had no horizontal overflow in the public checks. |
| Android Chrome / Android Emulator | `Medium_Phone_API_36.0` | blocked | Emulator instability prevented a valid Android Chrome PaperTrade execution screenshot. |
| Wallets | none | pass | Feedback did not require wallet approval. |

## Step Results

| Step | Result | Timing | Evidence |
| --- | --- | ---: | --- |
| Open feedback from newsstand | pass | under `2s` | Sidebar `Feedback` opened the modal; fields and controls were visible. |
| Invalid submission | pass | `422 ms` | Empty message showed `Tell us what happened before sending feedback.` and did not create a backend success state. |
| Valid newsstand submission | pass | `555 ms` | Visible `Feedback sent.` confirmation. |
| Help contextual submission | pass | `411 ms` | Help embedded form submitted successfully. |
| Reader contextual submission | pass | `873 ms` | Reader page feedback modal submitted successfully. |

## Telemetry And UserCom

- Browser diagnostic/session id: `8c7559b68711c4d9cc3008c7`
- UserCom feedback rows:
  - `139` newsstand, path `/`, status `new`
  - `142` help, path `/help`, status `new`
  - `145` reader, path `/read/5d0c3c44-0b3f-4b1a-94b4-000000000001/1`, status `new`
- UserCom signals included `feedback.opened` ids `2319181` and `2320123`, and `feedback.submitted` ids `2319418`, `2320111`, and `2320126`.
- PaperTrade `client_events` included matching `feedback.submitted` rows for the same session.
- Production PaperTrade and UserCom pod logs for the run window were empty.

## Evidence

- Private artifacts: `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T175532Z-all-seven-sweep/`
- Screenshots: `browser-ui/feedback-modal-open.png`, `browser-ui/feedback-invalid-empty.png`, `browser-ui/feedback-valid-success.png`, `browser-ui/help-feedback-success.png`, `browser-ui/reader-feedback-success.png`
- JSON/log artifacts: `usercom-query.json`, `papertrade-client-events.json`, `papertrade-logs-since-40m.txt`, `usercom-logs-since-40m.txt`

## Readiness Impact

Feedback capture now behaves correctly across the covered surfaces and reaches UserCom. Overall outcome is `warn` only because the required Android Emulator/Chrome matrix target could not be executed on this machine during the sweep.

