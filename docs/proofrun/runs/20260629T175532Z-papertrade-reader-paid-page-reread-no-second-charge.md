# ProofRun Record: PaperTrade paid page reread and no second charge

- ProofRun version: `1`
- Flow definition: `docs/proofrun/flows/papertrade-reader-paid-page-reread-no-second-charge.proofrun.yaml`
- Run ID: `20260629T175532Z-papertrade-reader-paid-page-reread-no-second-charge`
- Started at: `2026-06-29T17:55:32Z`
- Completed at: `2026-06-29T18:02:00Z`
- Outcome: `blocked`
- Operator: `AI agent`

## Scope

- Surface: PaperTrade
- Environment: production
- Base URL: `https://papertrade.metanet.app`
- Flow category: `redeem`
- State changing: `true`
- Spend cap: `0 sats`

## Deployment Identity

- Source commit deployed: `bc53f561d2f5fec29e942cd309fdd2304eb19ff8`
- Workflow runs: CI `28386213799`, deploy `28386316212`
- Image tag: `registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade:bc53f561d2f5-production-2026-06-29`
- Image digest: `sha256:697482f884e324b728fef4eb0ad23096a087fa8011f3984cc660443ed60901cc`
- Kubernetes pod: `papertrade-67d949b87f-wq6r9`, ready `1/1`, restarts `0`

## Blocker

This flow requires a reader wallet identity that already owns the selected paid page entitlement, plus a permission baseline proving that no new payment request or standing approval will occur. That state was not available in an inspectable, approved form on this machine during the sweep.

## Executed Safe Subset

- The selected publication and free page 1 were verified through the reader first-page flow.
- Paid page 2 was opened in a non-wallet browser and correctly showed wallet onboarding instead of rendering paid content.
- Domain safety check for the run window showed `page_entitlements: 0`, `ledger_entries: 0`, `payments: 0`, and `payouts: 0`.

## Matrix

| Requirement | Result | Notes |
| --- | --- | --- |
| Existing paid-page entitlement for test reader | blocked | No approved entitled identity was available. |
| Desktop wallet baseline | blocked | Could not inspect/revoke relevant PaperTrade permissions. |
| Android Emulator / mobile wallet | blocked | Android emulator did not remain attached for browser/wallet execution. |
| No second charge | not executed | No paid-page reread was attempted. |

## Evidence

- Private artifacts: `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/20260629T175532Z-all-seven-sweep/`
- Screenshots: `browser-ui/desktop-reader-page1.png`, `blocked-wallet-admin-author/paid-page2-no-wallet-second-tab.png`
- JSON/log artifacts: `papertrade-client-events.json`, `usercom-query.json`, `device-preflight/device-preflight.txt`

## Readiness Impact

The flow remains `blocked`. Future execution needs an approved reader identity with a known entitlement and a captured wallet permission baseline before opening the owned paid page.

