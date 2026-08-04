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

Not affiliated with Valve Corporation.
