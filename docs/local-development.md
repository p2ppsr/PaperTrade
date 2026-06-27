# Local Development

This guide is for running PaperTrade on a developer machine.

## Requirements

- Node.js 20 or newer.
- npm.
- MySQL or MariaDB.
- A BRC100-compatible wallet setup if you want to test authenticated or paid
  flows.

## Database

Create an empty database and user. Example:

```sql
CREATE DATABASE papertrade CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'papertrade'@'localhost' IDENTIFIED BY 'papertrade';
GRANT ALL PRIVILEGES ON papertrade.* TO 'papertrade'@'localhost';
FLUSH PRIVILEGES;
```

Then configure `.env`:

```sh
cp .env.example .env
```

## Environment Variables

| Variable | Default | Notes |
| --- | --- | --- |
| `HTTP_PORT` | `3001` | Express backend port. |
| `ROUTING_PREFIX` | `/api` | Prefix for API routes. |
| `HOSTING_DOMAIN` | `http://localhost:5173` in `.env.example` | Public origin used for metadata and wallet manifests. |
| `DATA_DIR` | `./data` in `.env.example` | Publication files, temporary files, appearance assets, and generated server key material. |
| `SQL_CLIENT` | `mysql2` | Knex client. |
| `SQL_DATABASE_HOST` | none | Database host. |
| `SQL_DATABASE_PORT` | `3306` | Database port. |
| `SQL_DATABASE_USER` | none | Database username. |
| `SQL_DATABASE_PASSWORD` | none | Database password. |
| `SQL_DATABASE_DB_NAME` | none | Database name. |
| `BSV_NETWORK` | `mainnet` | Use `testnet` for test wallet-toolbox chain mode. |
| `WALLET_STORAGE_URL` | `https://storage.babbage.systems` | Wallet storage service used by the server wallet. |
| `SERVER_PRIVATE_KEY` | none | Optional server private key. Prefer local key files or secret managers. |
| `SERVER_PRIVATE_KEY_PATH` | `DATA_DIR/server-private-key` | Key file path when `SERVER_PRIVATE_KEY` is not set. |
| `USERCOM_SIGNAL_ENDPOINT` | `https://usercom.babbage.systems/signal` | Server-side UserCom signal endpoint. |
| `PAPERTRADE_SEED_STARTER_WORKS` | enabled | Set to `false` to skip bundled public-domain library seeding. |
| `VITE_WALLET_ORIGINATOR` | browser hostname | Frontend wallet originator override for local debugging. |
| `VITE_WALLET_SUBSTRATE` | auto-detected | Frontend wallet substrate override for local debugging. |
| `VITE_APP_VERSION` | `browser` | Release label sent in frontend telemetry context. |

## Start The App

```sh
npm install
npm run migrate
npm run dev
```

The app runs two processes:

- Vite frontend development server;
- Express backend API server.

## Validate Changes

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm start` only after `npm run build`; it serves `dist/server/server.js`
and the built frontend assets.

## Wallet Testing

Unauthenticated visitors can browse publications and read page 1. Authenticated
author, admin, preview, paid-page, and payout flows require a compatible wallet
environment. For local debugging, use a wallet browser or set
`VITE_WALLET_SUBSTRATE` deliberately for the wallet bridge you are testing.
