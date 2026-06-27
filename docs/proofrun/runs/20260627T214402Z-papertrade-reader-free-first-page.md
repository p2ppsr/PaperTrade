# ProofRun Record: PaperTrade/reader free first page

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-free-first-page.proofrun.yaml`
- Run ID: `20260627T214402Z-papertrade-reader-free-first-page`
- Started at: `2026-06-27T21:44:02Z`
- Completed at: `2026-06-27T21:54:47Z`
- Outcome: `warn`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Repo: `p2ppsr/PaperTrade`
- Workspace: `/Users/tyeverett/projects/PaperTrade`
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Target audience: new reader evaluating PaperTrade without wallet knowledge
- Flow category: `discover`
- State changing: `no`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit: `9d87e6f01443b3049a0bc856f45400e95cc9b891`
- Branch: `master`
- Workflow run: `28298423945`
- Deployment ID: not applicable
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:c4ac557821f0-production-2026-06-27`
- Image digest: `sha256:9e2a7423acbc697f28eef342b2953b84605566f71675555af722e62b8e5fad46`
- Kubernetes namespace/workload: `papertrade-prod/deployment/papertrade`
- CARS project: not applicable
- Other release identity: pod `papertrade-86db5fcf6-g9585`, node `server4`, ready `1/1`, restarts `0`

## Wallet And Device Matrix Used

| Dimension | Value | Result | Notes |
| --- | --- | --- | --- |
| Desktop browser | Headless Google Chrome via DevTools Protocol, 1440x900 | pass | Full click path executed: newsstand -> publication detail -> page 1. |
| Desktop browser | Safari WebDriver | blocked | `safaridriver` reported that Safari Settings must enable Allow Remote Automation; `safaridriver --enable` requested a password and did not enable it. |
| Mobile browser | iOS Simulator Safari, Codex iPhone 16 iOS 18.5 | pass | Screenshots captured for newsstand, detail, and page 1. |
| Mobile browser | Android Emulator Chrome, Pixel_6 | pass | Chrome setup prompts were dismissed, then screenshots captured for newsstand, detail, and page 1. |
| Mobile simulator | iOS Simulator | pass | Device `781FCAE3-8C88-4B65-AC14-1C622A9FB45B`. |
| Mobile simulator | Android Emulator | pass | AVD `Pixel_6`. |
| Desktop wallet | none | pass | No wallet required for this flow. |
| Mobile wallet | none | pass | No wallet required for this flow. |
| Server wallet | none | pass | No wallet/payment action executed. |
| Network | mainnet production | pass | Read-only public flow. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree clean | `git status --short --branch` | pass | `## master...origin/master` before recording this run. |
| Source commit | `git rev-parse HEAD` | pass | `9d87e6f01443b3049a0bc856f45400e95cc9b891`. |
| Live HTTP | Chrome/Safari/Android/iOS navigation and `curl` | pass | Homepage, detail, and reader routes loaded. |
| Health endpoint | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| Public status | `curl -fsS https://papertrade.metanet.app/api/status` | pass | `mode:"public_submissions"`, `pricePerPageSats:25`. |
| Public catalog | `curl -fsS https://papertrade.metanet.app/api/publications` | pass | 10 publications; first was `Pride and Prejudice`. |
| Deployment state | `kubectl -n papertrade-prod get deploy/pods` | pass | Deployment available `1/1`, pod ready `1/1`, restarts `0`. |
| Wallet availability | not required | pass | No wallet action in this ProofRun. |
| Spend cap confirmed | flow definition | pass | `0 sats`. |
| Telemetry endpoint | production `client_events` query by browser session id | warn | Required events existed except flow expected `publication.viewed`; production emitted `publication.view`. |

## Step Results

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Open newsstand | H1/title identify PaperTrade; first viewport explains value; real works render. | Chrome, iOS Safari, and Android Chrome rendered PaperTrade, nav, feedback, search, and first real publication. | pass | Chrome desktop FCP `536ms`; mobile emulation FCP `80ms`. |
| 2. Inspect catalog | First cards readable and agree with API. | API returned 10 publications; first card/detail matched `Pride and Prejudice`, `Jane Austen`, `297` pages. | pass | Catalog visible within threshold. |
| 3. Open publication detail | Detail makes work, author, page count, and page 1 free action clear. | Detail route rendered cover, author, public-domain badge, title, description, and `Read first page free`. | pass | Chrome route transition completed within threshold. |
| 4. Read page 1 free | Page image renders; no wallet prompt; direct API has free access header. | Page 1 rendered in Chrome, iOS Safari, and Android Chrome; direct API returned PNG `1224x1584` and `X-PaperTrade-Page-Access: free`. | pass | Page image visible within threshold. |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Chrome desktop/tablet/mobile metrics reported no horizontal overflow on newsstand, detail, or page 1. iOS Safari and Android Chrome screenshots showed usable layout with nav, search/detail, and page image visible.
- Notes: Android Chrome required dismissing Chrome first-run prompts before product evidence could be captured.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: First screen says `Start reading free. Continue page by page when you are ready.` The detail CTA says `Read first page free`.
- Notes: The first action does not require wallet or BSV knowledge.

### Customer Trust

- Result: `pass`
- Evidence: Page 1 rendered without wallet prompt. The product explains free reading before continuation.
- Notes: No paid or wallet action occurred.

### Flow Success

- Result: `pass`
- Evidence: Homepage, `/api/publications`, detail route, reader route, and direct page API all agreed on publication `5d0c3c44-0b3f-4b1a-94b4-000000000001`, `Pride and Prejudice`.
- Notes: Reload and direct deep-link checks for page 1 both rendered the page image.

### Telemetry And Observability

- Result: `warn`
- Expected events: `page.view`, `newsstand.loaded`, `publication.viewed`, `reader.first_page_loaded`
- Observed events: `page.view`, `newsstand.loaded`, `publication.view`, `reader.first_page_loaded`
- Log checks: Production pod logs for the run window were empty; no errors or secret-shaped log output observed.
- Notes: Production telemetry uses `publication.view`, but the flow definition and ops registry expect `publication.viewed`. Align the event contract before this flow can pass cleanly.

### Reliability And Repeatability

- Result: `pass`
- Evidence: Chrome clean context, reload, and direct deep link all rendered page 1. Read-only run created no entitlement, payment, feedback, payout, or publication state.
- Notes: Android Chrome first-run prompts are external browser setup, not a PaperTrade defect.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| First meaningful content | 2s | Chrome desktop FCP `536ms`; mobile emulation FCP `80ms` | pass |
| UI feedback after action | 500ms | Navigation feedback immediate; route loads within threshold | pass |
| Wallet prompt shown | n/a | No wallet prompt expected or shown | pass |
| Approval to confirmation | n/a | No wallet approval expected | pass |
| Full flow duration | 20s | Chrome automated route path completed inside threshold | pass |
| Telemetry visible | 60s | Events visible in production `client_events` within the run window | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260627T214402Z-papertrade-reader-free-first-page.md`
- Health/status/catalog outputs were saved under the private artifact path.
- Direct page API header showed `HTTP/2 200`, `content-type: image/png`, and `x-papertrade-page-access: free`.
- Browser metric summary saved as `browser-summary.json`.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260627T214402Z-reader-free-first-page/`

- `browser-summary.json`
- `client-events-session.json`
- `healthz.json`
- `status.json`
- `publications.json`
- `page-1-headers.txt`
- `page-1.png`
- `desktop-1440x900-*.png`
- `tablet-768x1024-*.png`
- `mobile-390x844-*.png`
- `ios-safari-*.png`
- `android-chrome-*-clean.png`
- `pod-logs-since-15m.txt`
- `desktop-safari-blocked.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| medium | Telemetry contract mismatch: flow/registry expect `publication.viewed`; production emits `publication.view`. | PaperTrade | Rename the emitted event or update the flow/registry contract, then rerun this ProofRun. |
| low | Desktop Safari automation is blocked on this Mac because Allow Remote Automation is disabled and `safaridriver --enable` requires an interactive password. | Operator | Enable Safari remote automation or remove desktop Safari from the required matrix for this flow. |

## Readiness Impact

- Commercial readiness changed: `no`
- Previous tier: `needs ProofRun execution`
- New tier: `needs ProofRun execution`
- Registry update needed: `yes`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/reader-free-first-page
Outcome: warn
Environment: production
Commit/deploy: PaperTrade 9d87e6f; image c4ac557821f0-production-2026-06-27; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Chrome desktop/tablet/mobile pass; iOS Safari simulator pass; Android Chrome emulator pass; desktop Safari blocked by local automation setting
Success evidence: newsstand, detail, and page 1 rendered; page 1 direct API returned PNG 1224x1584 with X-PaperTrade-Page-Access: free
Trust/UX findings: first action is clear and wallet-free; no horizontal overflow found; no wallet prompt before page 1
Performance: Chrome desktop FCP 536ms; route/page image checks inside thresholds
Telemetry/log evidence: production client_events recorded page.view, newsstand.loaded, publication.view, reader.first_page_loaded; pod logs empty for run window
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260627T214402Z-reader-free-first-page/
Next action: align publication.view vs publication.viewed, enable/decide desktop Safari coverage, then rerun for pass
```
