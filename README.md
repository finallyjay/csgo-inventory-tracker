# CS:GO Inventory Tracker

Track your CS:GO / CS2 inventory, item values, floats and stickers — in one neon-lit
place. Shares the retro arcade / CRT aesthetic and tooling base of
[steam-backlog-hunter](https://github.com/finallyjay/steam-backlog-hunter).

> ⚠️ Early scaffold. The design system and tooling are in place; the inventory
> domain logic is not yet implemented.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript strict
- Tailwind CSS 4 + shadcn/ui (new-york) + Radix UI
- Vitest + Testing Library
- pnpm 10.25, Node 24.13
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
