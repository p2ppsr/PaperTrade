# PaperTrade ProofRun Suite

ProofRun is the production end-to-end QA standard for PaperTrade's commercial
readiness flows. Reusable flow definitions live in `docs/proofrun/flows/`.
Executed run records should be saved in `docs/proofrun/runs/`, with private raw
evidence stored in `network-ops/artifacts/proofrun/p2ppsr/PaperTrade/`.

## Initial Flow Order

Run these first because they build confidence from the public reader funnel into
wallet conversion, recovery, creator supply, and settlement.

1. `papertrade-reader-free-first-page.proofrun.yaml`
2. `papertrade-reader-paid-page-purchase.proofrun.yaml`
3. `papertrade-reader-paid-page-reread-no-second-charge.proofrun.yaml`
4. `papertrade-wallet-failure-recovery.proofrun.yaml`
5. `papertrade-feedback-usercom-signals.proofrun.yaml`
6. `papertrade-author-submission-preview.proofrun.yaml`
7. `papertrade-admin-review-ledger-payout.proofrun.yaml`

Each flow defines its own production preflight, wallet/device matrix, safety
limits, user steps, acceptance criteria, telemetry expectations, performance
thresholds, and evidence requirements.
