# ProofRun Record: PaperTrade/feedback UserCom signals

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-feedback-usercom-signals.proofrun.yaml`
- Run ID: `20260629T155740Z-papertrade-feedback-usercom-signals`
- Started at: `2026-06-29T15:57:40Z`
- Completed at: `2026-06-29T16:03:09Z`
- Outcome: `warn`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Repo: `p2ppsr/PaperTrade`
- Workspace: `/Users/tyeverett/projects/PaperTrade`
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Target audience: reader, author, or evaluator sending feedback/support context
- Flow category: `feedback`
- State changing: `true`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit deployed: `302d68d1358d8108e5faa54b9682712d73852888`
- Current product repo commit while recording: `527baee6ed7eccca4fcc20197d9e618afbb4d142`
- Branch: `master`
- Workflow run: `28309579698`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:302d68d1358d-production-2026-06-28`
- Image digest: `sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- Pod: `papertrade-5d96b86596-8gxbd`
- Pod status: `1/1 Running`, restarts `0`, node `server4`
- UserCom image: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/usercom:54859e2e7905-production-2026-06-26`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | In-app Chrome automation, 1280x720 | warn | Covered newsstand modal, Help embedded form, and reader modal. |
| Mobile browser | In-app Chrome mobile viewport, 390x844 | warn | Covered mobile feedback open and empty-message validation; not a real iOS Safari or Android Chrome device. |
| Mobile simulator | not run | warn | Required matrix lists Android emulator, but this run did not use one. |
| Desktop wallet | none | pass | Ordinary feedback required no wallet approval. |
| Mobile wallet | none | pass | Ordinary feedback required no wallet approval. |
| Server wallet | none | pass | No payment or wallet action executed. |
| Network | mainnet production | pass | Zero-spend feedback records only. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree baseline | `git status --short --branch` | pass | PaperTrade was `## master...origin/master` before recording. |
| PaperTrade health | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| UserCom health | `curl -fsS https://usercom.babbage.systems/healthz` | pass | `ok:true`, `database:"ok"`. |
| Public pages | `curl -fsS /` and `/help` | pass | Homepage and Help returned HTML. |
| Deployment state | `kubectl rollout status` for PaperTrade and UserCom | pass | Both deployments successfully rolled out. |
| UserCom query path | In-pod production DB query | pass | Queried only rows matching run id/session. |
| Spend cap | Flow definition and executed actions | pass | No wallet/payment action executed. |

## Step Results

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Open feedback from newsstand | Feedback is discoverable and stable. | Primary sidebar `Feedback` button opened the modal; fields and close/submit controls were visible with no horizontal overflow. | pass | `548 ms` |
| 2. Submit valid feedback | Success confirmation and UserCom capture. | Newsstand submission returned visible `Feedback sent.` and created UserCom feedback row `127` plus `feedback.submitted` signals. | warn | `1004 ms` |
| 3. Submit invalid feedback | Actionable validation without backend success. | Empty message produced `Tell us what happened before sending feedback.` and did not clear useful data. | pass | under `3 s` |
| 4. Feedback from contextual surfaces | Help and reader context attached. | Help embedded form and reader modal both submitted with surface-specific UserCom metadata; rows `130` and `133`. | pass | Help `953 ms`; reader open `1436 ms`; reader submit `559 ms` |
| 5. Mobile-width feedback check | Controls fit mobile width. | At `390x844`, modal width was `358 px`, controls were visible, empty-message validation worked, and `overflowX:false`. | warn | mobile open `1408 ms` |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Desktop and mobile screenshots are saved. Desktop and mobile checks reported `overflowX:false`; mobile modal fit within a `390x844` viewport with visible close, name, email, message, and submit controls.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: Feedback is available from the primary nav, Help page, embedded newsstand/Help panels, and reader route. Help text explicitly says the diagnostic ID connects feedback to the session without requiring login.

### Customer Trust

- Result: `warn`
- Evidence: Success and validation messages are clear, and feedback does not require wallet approval. The submit button remains enabled and continues to read `Send feedback` while submitting, so there is no explicit in-flight progress or duplicate-submit guard visible to the user.

### Flow Success

- Result: `pass`
- Evidence:
  - UserCom feedback rows: `127` newsstand, `130` help, `133` reader.
  - All rows used `source:"papertrade"` and status `new`.
  - Surface/path metadata matched `/`, `/help`, and `/read/5d0c3c44-0b3f-4b1a-94b4-000000000001/1`.

### Telemetry And Observability

- Result: `pass`
- Evidence:
  - Browser diagnostic/session id: `8c7559b68711c4d9cc3008c7`.
  - PaperTrade `client_events` contained `page.view`, `feedback.opened`, `feedback.submitted`, `newsstand.loaded`, and `reader.first_page_loaded`.
  - UserCom `signals` contained matching `page.view`, `feedback.opened`, and `feedback.submitted` records for the same session id.
  - `feedback.submitted` appears twice per successful submit in UserCom because both UserCom `/submit` and PaperTrade's client-side post-success signal record the event.
  - `feedback.failed` did not emit for empty-message validation, consistent with the flow's client-only validation allowance.

### Reliability And Repeatability

- Result: `warn`
- Evidence: The flow can be repeated with a new run id and public-safe message. Duplicate-submit prevention was not proven because the UI does not disable or show progress during submit; the run did not intentionally create duplicate records.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| Feedback UI opens | 2s | Newsstand `548 ms`, reader `1436 ms`, mobile `1408 ms` | pass |
| UI feedback after empty submit | 3s | validation visible under `3 s` | pass |
| Submission confirmation | 5s | Newsstand `1004 ms`, Help `953 ms`, Reader `559 ms` | pass |
| Telemetry visible | 60s | UserCom and PaperTrade DB queries found matching rows immediately after run | pass |
| Full flow duration | 30s | Browser interaction window exceeded 30s because it covered three surfaces and mobile-width validation | warn |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260629T155740Z-papertrade-feedback-usercom-signals.md`
- UserCom feedback IDs: `127`, `130`, `133`
- UserCom signal examples: `feedback.opened` id `2272885`, `feedback.submitted` ids `2273305`, `2273803`, `2274289`
- PaperTrade diagnostic/session id: `8c7559b68711c4d9cc3008c7`
- Production health remained OK after the run.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T155740Z-papertrade-feedback-usercom-signals/`

- `desktop-home-before-feedback.png`
- `desktop-feedback-open.png`
- `desktop-feedback-invalid-empty.png`
- `desktop-feedback-newsstand-success.png`
- `desktop-help-embedded-feedback-success.png`
- `desktop-reader-before-feedback.png`
- `desktop-reader-feedback-open.png`
- `desktop-reader-feedback-success.png`
- `mobile-home.png`
- `mobile-feedback-open.png`
- `mobile-feedback-invalid-empty.png`
- `browser-diagnostic-id.json`
- `usercom-query.json`
- `papertrade-client-events.json`
- `papertrade-pod-logs-since-45m.txt`
- `usercom-pod-logs-since-45m.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| medium | Feedback submit does not visibly enter an in-flight state; the button remains enabled and still reads `Send feedback` during submission. | PaperTrade | Disable the submit button or show explicit progress while the `/submit` request is in flight, and prevent accidental duplicate sends. |
| low | UserCom records two `feedback.submitted` signals per successful feedback: one from `/submit` and one from the PaperTrade post-success client signal. | PaperTrade/UserCom | Decide whether dual server/client confirmation is intentional; otherwise deduplicate or rename one event. |
| low | This run used Chrome automation and a mobile viewport, not real iOS Safari, Android Chrome, or Android Emulator. | ProofRun procedure | Complete a real-device/emulator matrix pass before promoting the flow as fully passing. |

## Readiness Impact

- Commercial readiness changed: `no`
- Previous tier: `needs ProofRun execution`
- New tier: `needs ProofRun execution`
- Registry update needed: `no`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/feedback-usercom-signals
Outcome: warn
Environment: production
Commit/deploy: PaperTrade production source 302d68d; current docs repo 527baee; image 302d68d1358d-production-2026-06-28; digest sha256:e22078f0a551ca107472cdcfe4466e9a7f6d330b857e99b0d65a88fedc318d69; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: desktop in-app Chrome automation plus 390x844 mobile viewport; no wallet required; real iOS Safari/Android Chrome/Android Emulator not run
Success evidence: newsstand, Help, and reader feedback submissions reached visible Feedback sent states and created UserCom rows 127, 130, and 133 with source papertrade and surface/path metadata
Trust/UX findings: validation and success copy are clear, but submit has no in-flight disabled/progress state and duplicate-submit prevention was not proven
Performance: open 548-1436ms; submit confirmation 559-1004ms; telemetry visible immediately
Telemetry/log evidence: PaperTrade client_events and UserCom signals found page.view, feedback.opened, feedback.submitted for session 8c7559b68711c4d9cc3008c7; pod logs for PaperTrade/UserCom were empty in the run window
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T155740Z-papertrade-feedback-usercom-signals/
Next action: add submit in-flight/duplicate protection, then rerun this flow on the full real-device/emulator matrix for a pass
```
