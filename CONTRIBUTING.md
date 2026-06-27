# Contributing

Thanks for helping improve PaperTrade.

## Development Setup

1. Install Node.js 20 or newer.
2. Create a MySQL or MariaDB database.
3. Copy `.env.example` to `.env` and edit the database values.
4. Run:

```sh
npm install
npm run migrate
npm run dev
```

## Before Opening A Pull Request

Run the same checks used by CI:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For changes that affect payments, wallet authentication, publication rendering,
telemetry, or deployment, include the manual validation you performed in the PR
description.

## Code Style

- TypeScript is required for application code.
- Keep server secrets out of source, logs, tests, screenshots, and PR comments.
- Prefer small, focused changes that preserve the existing Express, React, Knex,
  and BRC100 patterns.
- Add tests when changing shared utilities, money calculations, content
  rendering, telemetry normalization, or API behavior.

## Product Direction

PaperTrade is intended to stay useful as a real BSV application example:

- readers should understand what they can read before paying;
- authors should understand balances and payouts;
- operators should be able to self-host without Project Babbage private
  infrastructure;
- wallet and payment flows should fail with useful guidance instead of raw
  transport errors.

## License

By contributing, you agree that your contribution is provided under the Open BSV
License used by this repository.
