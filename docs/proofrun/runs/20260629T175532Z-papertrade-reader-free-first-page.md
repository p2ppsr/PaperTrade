# ProofRun Record: PaperTrade reader discovery to first free page

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-free-first-page.proofrun.yaml`
- Run ID: `20260629T175532Z-papertrade-reader-free-first-page`
- Started at: `2026-06-29T17:55:32Z`
- Completed at: `2026-06-29T18:02:00Z`
- Outcome: `warn`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Flow category: `discover`
- State changing: `false`
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
| Desktop browser | In-app Chrome automation, 1280x720 | pass | Newsstand, detail, and page 1 rendered. |
| Mobile browser | iOS Safari on `Codex iPhone 16 iOS 18.5` | pass | Corrected active Safari screenshot captured after launch. |
| Mobile viewport | Browser viewport `390x844` | pass | No horizontal overflow; page 1 image rendered. |
| Android Chrome / Android Emulator | `Medium_Phone_API_36.0` | blocked | Emulator booted once but Chrome URL handling landed outside loaded PaperTrade; retry boot disappeared from `adb devices`. Zero-byte corrected capture files were left as failed-attempt evidence. |
| Wallets | none | pass | No wallet required for page 1. |

## Step Results

| Step | Result | Evidence |
| --- | --- | --- |
| Open newsstand | pass | H1 `PaperTrade`; cards for real public-domain works including `Pride and Prejudice`, `The Adventures of Sherlock Holmes`, and `Alice in Wonderland`; no horizontal overflow. |
| Inspect catalog | pass | `/api/publications` returned published starter works with human author names, page counts, and source metadata. |
| Open publication detail | pass | `Pride and Prejudice` detail showed author `Jane Austen`, `297 pages`, `Page 1 free`, `25 sats per paid page`, and `Read first page free`. |
| Read page one free | pass | `/read/5d0c3c44-0b3f-4b1a-94b4-000000000001/1` rendered `Rendered page 1` as a `1224x1584` image. Direct HTTP returned `X-PaperTrade-Page-Access: free`. |

## Telemetry

- Browser diagnostic/session id: `8c7559b68711c4d9cc3008c7`
- UserCom signals included `page.view`, `newsstand.loaded`, and `reader.first_page_loaded`; example signal ids include `2318890`, `2318938`, `2318950`, and `2320120`.
- PaperTrade `client_events` included `page.view`, `newsstand.loaded`, `publication.view`, and `reader.first_page_loaded` for the selected publication/page.
- Production pod logs for the run window were empty.

## Evidence

- Private artifacts: `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T175532Z-all-seven-sweep/`
- Screenshots: `browser-ui/desktop-home.png`, `browser-ui/desktop-publication-detail.png`, `browser-ui/desktop-reader-page1.png`, `browser-ui/mobile-viewport-home.png`, `browser-ui/mobile-viewport-reader-page1.png`, `device-preflight/ios-safari-papertrade-active.png`
- JSON/log artifacts: `usercom-query.json`, `papertrade-client-events.json`, `papertrade-logs-since-40m.txt`, `device-preflight/device-preflight.txt`

## Readiness Impact

The reader first-page product path passed on desktop and iOS. Overall outcome is `warn` because the required Android Emulator/Chrome target could not be kept attached long enough to execute the page after two boot/open attempts.

