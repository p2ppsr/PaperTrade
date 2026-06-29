# ProofRun Record: PaperTrade reader paid page purchase

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-paid-page-purchase.proofrun.yaml`
- Run ID: `20260629T175532Z-papertrade-reader-paid-page-purchase`
- Started at: `2026-06-29T17:55:32Z`
- Completed at: `2026-06-29T18:02:00Z`
- Outcome: `blocked`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Flow category: `pay`
- State changing: `true`
- Spend cap: `100 sats`

## Deployment Identity

- Source commit deployed: `bc53f561d2f5fec29e942cd309fdd2304eb19ff8`
- Workflow runs: CI `28386213799`, deploy `28386316212`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:bc53f561d2f5-production-2026-06-29`
- Image digest: `sha256:697482f884e324b728fef4eb0ad23096a087fa8011f3984cc660443ed60901cc`
- Kubernetes pod: `papertrade-67d949b87f-wq6r9`, ready `1/1`, restarts `0`

## Preflight

- `/healthz` returned `ok:true` and `setupComplete:true`.
- `/api/status` returned `mode:"public_submissions"` and `pricePerPageSats:25`.
- `/api/publications` returned the starter catalog; selected candidate was `Pride and Prejudice`, publication id `5d0c3c44-0b3f-4b1a-94b4-000000000001`, page count `297`.
- Page 1 returned `200 image/png` with `X-PaperTrade-Page-Access: free`.
- Unauthenticated page 2 JSON returned `401` with `Authenticate with a BRC100 wallet to read paid pages`.

## Matrix And Blocker

| Requirement | Result | Evidence |
| --- | --- | --- |
| Approved funded reader wallet | blocked | No approved test reader identity with inspectable PaperTrade permission baseline was available. |
| Desktop wallet prompt inspection | blocked | BSV Browser, BSV Desktop, Metanet, Metanet Client, and User Wallet apps are installed, but the run did not have a safe way to inspect/revoke payment, basket, protocol, PACT, certificate, or manifest-derived PaperTrade permissions. |
| Android Emulator / Metanet Explorer Android | blocked | Emulator booted then dropped from `adb devices`; Android Chrome execution could not be completed. |
| Server wallet | pass preflight | Production health remained OK; no payout/server-wallet action was required before the reader payment branch. |

## Executed Safe Subset

- Free page 1 was opened successfully during the reader first-page flow.
- Opening paid page 2 in a non-wallet browser showed wallet onboarding and did not create any entitlement/payment/ledger rows.
- No production spend was attempted because the permission baseline required by doctrine could not be proven.

## Evidence

- Private artifacts: `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T175532Z-all-seven-sweep/`
- Screenshots: `browser-ui/desktop-reader-page1.png`, `blocked-wallet-admin-author/paid-page2-no-wallet-second-tab.png`
- JSON/log artifacts: `papertrade-client-events.json`, `usercom-query.json`, `device-preflight/device-preflight.txt`

## Readiness Impact

The paid purchase flow is `blocked`, not failed: public preflight and wallet-onboarding behavior are healthy, but the run could not safely approve a mainnet spend without the required wallet permission baseline and stable wallet substrate.

