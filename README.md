# PaperTrade

PaperTrade is an open-source BSV newsstand for pay-per-page publishing.

Readers can browse a public library, read page 1 for free, and unlock paid
pages with a BRC100-compatible wallet. Authors can publish print-ready writing,
preview rendered pages, and receive ledgered revenue. Operators can run their
own PaperTrade server with editorial review, configurable pricing, platform
commission, UserCom signals, and wallet-based administration.

Live server: <https://papertrade.metanet.app>

Source: <https://github.com/p2ppsr/PaperTrade>

## Why It Exists

PaperTrade shows a complete wallet-native content commerce flow:

- no passwords;
- BRC100 identity for readers, authors, and admins;
- first-page-free discovery;
- per-page payment and entitlement checks;
- server-side publication rendering for PDF, docx, and ePub uploads;
- author balances and payout workflow;
- feedback and funnel telemetry through UserCom.

It is meant to be inspected, forked, deployed, and improved by builders who want
real BSV application patterns instead of a narrow demo.

## Try It

Open the live server and read page 1 of any public-domain work:

<https://papertrade.metanet.app>

Paid pages require a compatible BRC100 wallet browser or wallet bridge. The app
links to wallet setup from protected flows when one is not available.

## Run Locally

Requirements:

- Node.js 20 or newer;
- npm;
- MySQL or MariaDB;
- a reachable BRC100 wallet storage service, such as
  `https://storage.babbage.systems`.

Create a database, copy the example environment, and run the app:

```sh
cp .env.example .env
npm install
npm run migrate
npm run dev
```

The development server starts the Vite frontend and Express backend together.
By default, the backend listens on `http://localhost:3001` and the frontend is
served by Vite.

For a full environment variable reference, see
[docs/local-development.md](docs/local-development.md).

## Useful Commands

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Docker

The application runtime uses LibreOffice, Calibre, and Poppler for document
conversion. Build the runtime base first, then the app image:

```sh
docker build -f Dockerfile.runtime-base -t papertrade-runtime-base:local .
docker build -t papertrade:local .
```

## Project Layout

```text
src/client/               React app, wallet integration, feedback, telemetry
src/server/               Express API, BRC100 auth/payment, rendering, ledger
src/server/public-domain/ Seed public-domain library texts and cover art
migrations/               Knex database migrations
infra/kubernetes/         Kubernetes manifests for the production shape
scripts/k8s/              In-cluster image build and deploy scripts
docs/                     Operator and contributor documentation
```

## Deployment

The repository includes Kubernetes manifests and GitHub Actions for the live
PaperTrade production deployment, but those workflows target Project Babbage's
private infrastructure and production secrets. Self-hosters should treat them as
a working reference architecture, not a one-command public deploy.

Start with [docs/devops.md](docs/devops.md) if you want to run a similar
Kubernetes deployment.

## Telemetry And Privacy

PaperTrade emits product signals and feedback to UserCom so operators can
understand whether readers are finding, trying, and unlocking content. Telemetry
payloads are normalized and sensitive-shaped fields such as private keys,
passwords, tokens, signatures, raw transactions, and BEEF payloads are redacted
before forwarding.

Set `USERCOM_SIGNAL_ENDPOINT` if you want server-side signals to go somewhere
other than the default Project Babbage UserCom endpoint. Client-side UserCom
endpoints are currently compiled into `src/client/usercom.ts`.

## Contributing

Issues and pull requests are welcome after the repository is public. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

Security reports should follow [SECURITY.md](SECURITY.md).

## License

PaperTrade is copyright (c) 2026 P2PPSR and released under the Open BSV License. See
[LICENSE.txt](LICENSE.txt).
