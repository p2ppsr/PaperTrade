# Open Source Launch Notes

Use this file as the public launch checklist for the PaperTrade repository.

## Public Links

- Repository: <https://github.com/p2ppsr/PaperTrade>
- Live server: <https://papertrade.metanet.app>
- Local setup: [local-development.md](local-development.md)
- DevOps reference: [devops.md](devops.md)

## Launch Checklist

- Repository visibility set to public on GitHub.
- GitHub description set to: `Open-source BSV newsstand for pay-per-page publishing with BRC100 wallets.`
- GitHub homepage set to: `https://papertrade.metanet.app`
- Topics set to include `bsv`, `brc100`, `payments`, `publishing`,
  `newsstand`, `react`, `express`, and `typescript`.
- `README.md` renders cleanly and the live server link works.
- `LICENSE.txt`, `.env.example`, `CONTRIBUTING.md`, and `SECURITY.md` are
  present.
- CI passes on `master`.
- Live server health check returns `ok:true`:

```sh
curl -fsS https://papertrade.metanet.app/healthz
```

## Suggested Launch Post

PaperTrade is now open source.

It is a BSV newsstand where readers browse a public library, read page 1 free,
and unlock paid pages with a BRC100 wallet. Authors publish print-ready work,
operators can run their own server, and the live instance is already up:

https://papertrade.metanet.app
https://github.com/p2ppsr/PaperTrade

## Builder Angle

PaperTrade is not just a mockup. The repo includes the React app, Express API,
Knex migrations, BRC100 auth/payment integration, document rendering, author
ledger, UserCom feedback/signals, Kubernetes manifests, and CI.

## License Line

Open BSV License. Copyright (c) 2026 P2PPSR.
