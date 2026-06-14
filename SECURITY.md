# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in csgo-inventory-tracker, please report it privately via GitHub's [private vulnerability reporting](https://github.com/finallyjay/csgo-inventory-tracker/security/advisories/new) feature. **Do not open a public issue.**

Expect an initial acknowledgement within a few days. This is a personal project maintained in spare time, so response times are best-effort — but credible vulnerability reports will be prioritised over feature work.

## Supported versions

Only the latest commit on `main` is supported. There are no versioned releases.

## Scope

**In scope:**

- The Next.js application — API routes, the Steam OpenID 2.0 login flow, the whitelist check, and the HMAC-signed `steam_user` session cookie
- The inventory valuation pipeline — Steam inventory fetching, Steam Market price caching, and the daily snapshot cron (`/api/cron/snapshot-inventory`, Bearer `CRON_SECRET`)
- Server-side handling of the Steam Web API key and other secrets
- SQLite storage (`steam_profile`, `allowed_users`, price/value history tables)
- Dependency vulnerabilities surfaced by Dependabot

**Out of scope:**

- Steam Web API or Steam Market vulnerabilities — report those directly to Valve
- Social engineering against project contributors
- Denial of service against any deployed instance
- Issues that require a user to already have admin access to the deployed instance
