# CS:GO Inventory Tracker

Track your CS:GO / CS2 inventory, item values and applied stickers — in one
neon-lit place. Shares the retro arcade / CRT aesthetic and tooling base of
[steam-backlog-hunter](https://github.com/finallyjay/steam-backlog-hunter).

## Features

- **Steam sign-in** via Steam OpenID, gated by a Steam ID whitelist. The session
  is a signed (HMAC), expiring cookie.
- **Inventory** — skins, knives, gloves, cases and applied stickers, valued at
  Steam Market prices (cached, rate-limit-aware fetching).
- **Portfolio value over time** — a daily cron snapshots each user's inventory
  value; the dashboard and history views chart it.
- **Per-item price history** and holdings breakdowns.
- **Admin** page to manage the allowed-users whitelist.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript strict
- Tailwind CSS 4 + shadcn/ui (new-york) + Radix UI
- `node:sqlite` for storage (prices cache, profiles, value snapshots)
- Vitest + Testing Library
- pnpm (pinned in `packageManager`), Node 24 (`.nvmrc`)
- oxlint + oxfmt, Husky + lint-staged

## Getting started

```bash
pnpm install
cp .env.example .env       # fill in STEAM_API_KEY at minimum
pnpm dev                    # http://localhost:3000
```

See [Configuration](#configuration) below for what each variable does and
which ones are actually required.

## Configuration

Environment variables are validated with Zod in `lib/env.ts` (server-only
ones) and read directly from `process.env` for a couple of public/runtime
ones. Copy `.env.example` to `.env` and fill it in.

| Variable                       | Required | Description                                                                                                                                        |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STEAM_API_KEY`                | Yes      | Steam Web API key ([get one here](https://steamcommunity.com/dev/apikey)). Also used as the session-signing fallback if `SESSION_SECRET` is unset. |
| `ADMIN_STEAM_ID`               | No       | Your Steam64 ID. Always whitelisted and granted access to `/admin`.                                                                                |
| `STEAM_WHITELIST_IDS`          | No       | Comma-separated Steam64 IDs allowed in addition to `ADMIN_STEAM_ID` and the DB-backed whitelist.                                                   |
| `NEXTAUTH_URL`                 | No       | Base URL used as the Steam OpenID realm/return_to and for absolute metadata URLs. Falls back to the request origin.                                |
| `SQLITE_PATH`                  | No       | Overrides the SQLite database file path (defaults to `/data/` when writable, else `.data/` in the project root).                                   |
| `STEAM_MARKET_CURRENCY`        | No       | Currency used to value inventories via the Steam Market: `USD` \| `GBP` \| `EUR` (default `USD`).                                                  |
| `CRON_SECRET`                  | No       | Bearer token required by `GET /api/cron/snapshot-inventory`. The daily snapshot cron fails closed if this is unset.                                |
| `SESSION_SECRET`               | Yes\*    | HMAC key used to sign the session cookie. \*Required in production; falls back to `STEAM_API_KEY` in development/test only.                        |
| `NODE_ENV`                     | No       | `development` \| `production` \| `test` (default `development`). Usually set automatically by tooling.                                             |
| `NEXT_PUBLIC_APP_VERSION`      | No       | App version shown in the UI footer (build-time, public).                                                                                           |
| `NEXT_PUBLIC_DISPLAY_TIMEZONE` | No       | IANA timezone used to render timestamps in the UI. Falls back to the browser's timezone.                                                           |
| `LOG_LEVEL`                    | No       | Pino log level (default `info`).                                                                                                                   |

## Scripts

```bash
pnpm dev            # dev server
pnpm build          # production build (standalone)
pnpm lint           # oxlint + typecheck
pnpm typecheck      # next typegen + tsc --noEmit
pnpm test           # run tests (vitest)
pnpm test:coverage  # run tests with coverage
pnpm format         # oxfmt format all files
pnpm format:check   # oxfmt --check (no writes)
```

## Database migrations

The SQLite schema is managed by a lightweight, versioned migration system
(`lib/server/migrations.ts`). Migrations are an append-only, strictly-ordered
list; the highest applied version is tracked in SQLite's built-in
`PRAGMA user_version`, so no extra bookkeeping table is needed. On the first
connection (`getSqliteDatabase()`), every migration newer than the database's
current version is applied in order, each inside its own transaction — already
applied migrations are skipped, and a failure rolls back cleanly.

Migration v1 is the initial schema and uses `CREATE TABLE IF NOT EXISTS`, so a
database that predates the migration system (tables present, `user_version = 0`)
is stamped up to v1 without touching any data.

To add a migration:

1. Append a new entry to the `MIGRATIONS` array in `lib/server/migrations.ts`
   with `version: <previous + 1>`, a short `name`, and an `up(db)` that performs
   the schema change (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, …).
2. Never edit, reorder, or delete a released migration — treat each one as
   immutable, like a git commit.
3. Do not put connection pragmas (`journal_mode`, `synchronous`,
   `foreign_keys`) in a migration — those live in `sqlite.ts` and cannot run
   inside a transaction.
4. Add or extend coverage in `test/migrations.test.ts`.

Not affiliated with Valve Corporation.
