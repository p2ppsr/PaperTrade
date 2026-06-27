# Security

## Reporting A Vulnerability

Please do not open a public GitHub issue for vulnerabilities.

Send a private report to the Project Babbage maintainers with:

- a short description of the issue;
- affected routes, commits, or deployment assumptions;
- reproduction steps;
- whether payment, identity, author funds, private key material, or user content
  could be affected.

If you do not already have a private maintainer contact, use the feedback path
on the live server and mark the message as a security report:

<https://papertrade.metanet.app>

## Sensitive Material

Never commit or paste:

- `SERVER_PRIVATE_KEY` values;
- database passwords;
- wallet storage credentials;
- raw private keys, tokens, signatures, BEEF payloads, or full transactions
  from real users;
- production `.env` files.

Use `.env.example` for local setup and a secret manager for production.

## Supported Version

Security fixes target the `master` branch unless a maintainer announces a
release branch.
