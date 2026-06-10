# PaperTrade

PaperTrade is a BSV content newsstand. Authors publish print-ready writing, readers use BRC100 wallets, and the server sells access by page.

This repository was seeded from the deployment shape of `p2ppsr/gateway`: one Express server, one React frontend, Knex migrations, Docker packaging, and Kubernetes overlays. The product domain and payment flow have been replaced for PaperTrade.

## MVP

- BRC100 authentication with no passwords.
- Admin first-run setup.
- Private publishing by default.
- PDF/docx/ePub upload with canonical PDF storage.
- Five-page minimum for publications.
- First page free, paid page entitlements last 30 days.
- Server-ledger custody for author revenue and platform commission.

## Development

Create a MySQL database and set:

```sh
SQL_DATABASE_HOST=127.0.0.1
SQL_DATABASE_PORT=3306
SQL_DATABASE_USER=papertrade
SQL_DATABASE_PASSWORD=papertrade
SQL_DATABASE_DB_NAME=papertrade
WALLET_STORAGE_URL=https://storage.babbage.systems
DATA_DIR=./data
```

Then run:

```sh
npm install
npm run migrate
npm run dev
```

## License

Open BSV License.
