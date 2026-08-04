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
- pnpm 11.7, Node 24.13
- oxlint + oxfmt, Husky + lint-staged

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## Scripts

```bash
pnpm dev          # dev server
pnpm build        # production build (standalone)
pnpm lint         # oxlint + typecheck
pnpm test         # run tests
pnpm format       # oxfmt
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
