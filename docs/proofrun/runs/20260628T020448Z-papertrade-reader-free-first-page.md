# ProofRun Record: PaperTrade/reader free first page

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-free-first-page.proofrun.yaml`
- Run ID: `20260628T020448Z-papertrade-reader-free-first-page`
- Started at: `2026-06-28T02:04:48Z`
- Completed at: `2026-06-28T02:05:10Z`
- Outcome: `pass`
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
| Desktop browser | Safari WebDriver, 1440x900 | pass | Closure run covered newsstand, publication detail, and page 1 after enabling Safari remote automation. |
| Prior same-release evidence | Chrome desktop/tablet/mobile, iOS Simulator Safari, Android Emulator Chrome | pass | Prior run `20260627T214402Z-papertrade-reader-free-first-page` covered the broader matrix; its only warnings were Safari automation and the old event-name contract. |
| Desktop wallet | none | pass | No wallet required for this flow. |
| Mobile wallet | none | pass | No wallet required for this flow. |
| Server wallet | none | pass | No wallet/payment action executed. |
| Network | mainnet production | pass | Read-only public flow. |

## Preflight

| Check | Command/Method | Result | Evidence |
| --- | --- | --- | --- |
| Worktree clean | `git status --short --branch` | pass | `## master...origin/master` before recording this run. |
| Health endpoint | `curl -fsS https://papertrade.metanet.app/healthz` | pass | `ok:true`, `setupComplete:true`. |
| Public status | `curl -fsS https://papertrade.metanet.app/api/status` | pass | `mode:"public_submissions"`, `pricePerPageSats:25`. |
| Public catalog | `curl -fsS https://papertrade.metanet.app/api/publications` | pass | 10 publications; first was `Pride and Prejudice`. |
| Deployment state | `kubectl -n papertrade-prod get deploy/pods` | pass | Deployment available `1/1`; pod ready `1/1`, restarts `0`. |
| Wallet availability | not required | pass | No wallet action in this ProofRun. |
| Spend cap confirmed | flow definition | pass | `0 sats`. |
| Telemetry endpoint | production `client_events` by Safari session id `fcdda553595f308ba4bf4fa5` | pass | Required events present with the corrected `publication.view` contract. |

## Step Results

| Step | Expected | Actual | Result | Timing |
| --- | --- | --- | --- | ---: |
| 1. Open newsstand | H1/title identify PaperTrade; first viewport explains value; real works render. | Safari rendered PaperTrade, nav, feedback, search, and first real publication. | pass | `8325ms` including WebDriver navigation/screenshot wait. |
| 2. Inspect catalog | First cards readable and agree with API. | API returned 10 publications; first card/detail matched `Pride and Prejudice`, `Jane Austen`, `297` pages. | pass | Catalog rendered in run window. |
| 3. Open publication detail | Detail makes work, author, page count, and page 1 free action clear. | Detail route rendered cover, author, public-domain badge, title, description, `Read first page free`, `297 pages`, and `25 sats per paid page`. | pass | `5061ms` including WebDriver wait. |
| 4. Read page 1 free | Page image renders; no wallet prompt; direct API has free access header. | Page 1 rendered as a `1224x1584` image. Direct API returned `HTTP/2 200`, `content-type: image/png`, and `x-papertrade-page-access: free`. | pass | `4808ms` including WebDriver wait. |

## Assertions

### UI And Appearance

- Result: `pass`
- Evidence: Safari screenshots for newsstand, detail, and page 1 are saved. DOM inspection reported `overflowX:false` on all three routes.

### Intuitiveness For Target Audience

- Result: `pass`
- Evidence: First screen says `Start reading free. Continue page by page when you are ready.` The detail CTA says `Read first page free`.

### Customer Trust

- Result: `pass`
- Evidence: Page 1 rendered without wallet prompt. Paid continuation price is visible on the detail page before any paid action.

### Flow Success

- Result: `pass`
- Evidence: Homepage, `/api/publications`, detail route, reader route, and direct page API all agreed on publication `5d0c3c44-0b3f-4b1a-94b4-000000000001`, `Pride and Prejudice`.

### Telemetry And Observability

- Result: `pass`
- Expected events: `page.view`, `newsstand.loaded`, `publication.view`, `reader.first_page_loaded`
- Observed events: `page.view`, `newsstand.loaded`, `publication.view`, `reader.first_page_loaded`
- Log checks: Production pod logs for the run window were empty; no errors or secret-shaped log output observed.

### Reliability And Repeatability

- Result: `pass`
- Evidence: The two prior warning causes were remediated and verified: Safari remote automation is enabled, and the flow/ops registry now match the deployed `publication.view` event.

### Performance And Trust Latency

| Measurement | Pass Threshold | Actual | Result |
| --- | ---: | ---: | --- |
| First meaningful content | 2s | `newsstand.loaded` telemetry reported `287ms` publication load duration | pass |
| UI feedback after action | 500ms | Navigation produced visible loading/route state; final states rendered without frozen UI | pass |
| Wallet prompt shown | n/a | No wallet prompt expected or shown | pass |
| Approval to confirmation | n/a | No wallet approval expected | pass |
| Full flow duration | 20s | WebDriver route run completed in about `18.2s`; product telemetry showed route events within the run window | pass |
| Telemetry visible | 60s | Events visible in production `client_events` immediately after the run | pass |

## Evidence

### Public-Safe Evidence

- Run record: `docs/proofrun/runs/20260628T020448Z-papertrade-reader-free-first-page.md`
- Direct page API header showed `HTTP/2 200`, `content-type: image/png`, and `x-papertrade-page-access: free`.

### Private Artifacts

Stored under:

`network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T020448Z-reader-free-first-page-pass/`

- `safari-run.json`
- `client-events-session.json`
- `healthz.json`
- `status.json`
- `publications.json`
- `page-1-headers.txt`
- `desktop-safari-newsstand.png`
- `desktop-safari-detail.png`
- `desktop-safari-read-page-1.png`
- `pod-logs-since-15m.txt`

## Defects And Follow-Up

| Severity | Finding | Owner | Next Action |
| --- | --- | --- | --- |
| none | No blocking defects found in the corrected reader free first page flow. | PaperTrade | Proceed to the paid-page purchase ProofRun. |

## Readiness Impact

- Commercial readiness changed: `yes`
- Previous tier: `needs ProofRun execution`
- New tier: `needs ProofRun execution`
- Registry update needed: `no`
- Dossier update needed: `yes`
- Product repo update needed: `yes`

## Chat Summary

```text
ProofRun: PaperTrade/reader-free-first-page
Outcome: pass
Environment: production
Commit/deploy: PaperTrade 3e74b2a; image c4ac557821f0-production-2026-06-27; papertrade-prod/deployment/papertrade ready 1/1
Wallet/device matrix: Safari desktop closure pass; prior same-release Chrome desktop/tablet/mobile, iOS Safari simulator, and Android Chrome emulator evidence remained passing
Success evidence: newsstand, detail, and page 1 rendered; page 1 direct API returned PNG with X-PaperTrade-Page-Access: free
Trust/UX findings: first action is clear and wallet-free; no horizontal overflow in Safari closure run
Performance: newsstand.loaded reported 287ms publication load duration
Telemetry/log evidence: production client_events recorded page.view, newsstand.loaded, publication.view, reader.first_page_loaded for Safari session fcdda553595f308ba4bf4fa5; pod logs empty
Artifacts: network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260628T020448Z-reader-free-first-page-pass/
Next action: run papertrade-reader-paid-page-purchase
```
