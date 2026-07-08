# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build (standalone output)
pnpm lint             # oxlint + typecheck (runs both)
pnpm typecheck        # next typegen + tsc --noEmit
pnpm test             # Vitest run (all tests)
pnpm format           # oxfmt format all files
pnpm exec vitest run test/<file>.test.ts  # Run single test file
```

CI runs: install → lint → test → build (GitHub Actions, on push to main and PRs).
Pre-commit hooks run oxfmt + oxlint via Husky + lint-staged.

## Architecture

Next.js 16 App Router with React 19, TypeScript strict mode, Tailwind CSS 4, shadcn/ui (new-york style) + Radix UI primitives. Uses pnpm 10.25 and Node 24.13.

This project was bootstrapped from the `steam-backlog-hunter` base and shares its
retro arcade / CRT aesthetic. Steam OpenID login + a whitelist are wired up; the
inventory domain logic (CS:GO / CS2) is not yet implemented.

### Auth & whitelist

**Steam OpenID 2.0 → whitelist check → httpOnly session cookie**

- `app/api/auth/steam/route.ts` — initiates login: generates a CSRF nonce
  (httpOnly cookie), redirects to Steam OpenID. Rate-limited (10/min/IP).
- `app/api/auth/steam/callback/route.ts` — validates the nonce, verifies the
  OpenID response with Steam, enforces the whitelist, fetches the public profile
  (`GetPlayerSummaries`), sets the **HMAC-signed** `steam_user` httpOnly cookie
  (secure in prod, sameSite=lax, 7 days), upserts the profile, redirects to `/dashboard`.
- `lib/server/session.ts` — `signSession()` / `verifySession()`. The cookie is
  `<base64url(json)>.<hmac-sha256>` signed with `SESSION_SECRET` (falling back to
  `STEAM_API_KEY`), so a forged cookie — even with a whitelisted Steam ID — is rejected.
- `app/api/auth/me/route.ts` — returns the current user (`{ user }` or `{ user: null }`).
- `app/api/auth/logout/route.ts` — clears the session cookie.
- `app/lib/server-auth.ts` — `getCurrentUser()` / `requireAuth()` / `requireAdmin()`.
  Verifies the cookie signature, re-validates the whitelist on every call, and
  derives `isAdmin` fresh from `ADMIN_STEAM_ID` (never stored in the cookie).
- `hooks/use-current-user.ts` — global client user state (pub/sub, dedup,
  visibility revalidation).

**Whitelist** (`lib/whitelist.ts`): a Steam64 ID is allowed if it is the
`ADMIN_STEAM_ID`, present in the `allowed_users` DB table, or listed in the
`STEAM_WHITELIST_IDS` env var (comma-separated). Empty/missing = access denied.
Admins manage the DB-backed list at `/admin` via `app/api/admin/allowed-users`
(`lib/server/allowed-users.ts`).

### Environment variables

Validated lazily with Zod in `lib/env.ts`:

- `STEAM_API_KEY` (required) — https://steamcommunity.com/dev/apikey
- `ADMIN_STEAM_ID` — your Steam64; always allowed + grants `/admin`
- `STEAM_WHITELIST_IDS` — optional comma-separated extra allowed IDs
- `NEXTAUTH_URL` — base URL for the OpenID realm / return_to
- `SQLITE_PATH` — overrides DB path (`/data/` → `.data/` fallback)
- `STEAM_MARKET_CURRENCY` — `USD` | `GBP` | `EUR` (default USD)
- `CRON_SECRET` — Bearer token required by the daily snapshot cron
- `SESSION_SECRET` — optional HMAC key for the session cookie (falls back to `STEAM_API_KEY`)
- `NEXT_PUBLIC_DISPLAY_TIMEZONE` — optional IANA tz for the UI (build-time; falls back to the browser tz)

### Dates & timezones

The DB always stores **UTC** (snapshot days as UTC calendar days, `computed_at`/`added_at`
as ISO UTC). `lib/datetime.ts` is the client display layer: `formatDay()` renders a
'YYYY-MM-DD' UTC bucket day (never timezone-shifted — it's a bucket key), while
`formatDateTime()` renders real timestamps in the viewer's tz (`NEXT_PUBLIC_DISPLAY_TIMEZONE`
→ browser → UTC). Charts/holdings use `formatDay`; admin "added" and the value-panel
"updated" use `formatDateTime`.

### Data

SQLite via Node's built-in `node:sqlite` (`lib/server/sqlite.ts`). Tables:
`steam_profile` (cached public profiles), `allowed_users` (persisted whitelist),
`inventory_value_history` (one daily snapshot of total inventory value per user).
Structured logging via Pino (`lib/server/logger.ts`).

### Inventory valuation pipeline

**Steam inventory → Steam Market prices (cached) → daily value snapshot**

- `lib/market.ts` — pure, client-safe helpers: `parsePriceToMinorUnits()`,
  `formatPrice()`, currency map, CS2 app/context ids. Money is **integer minor
  units** (cents) everywhere to avoid float drift.
- `lib/server/steam-inventory.ts` — `fetchInventory()` hits
  `steamcommunity.com/inventory/{id}/730/2` and `parseInventory()` (pure) reduces
  it to marketable items aggregated by `market_hash_name`. Private/429 → `InventoryFetchError`.
- `lib/server/market-prices.ts` — `getPrices()` resolves prices via the shared
  `market_price_cache` table (12h TTL) and falls back to Steam Market
  `priceoverview`, fetched **sequentially with a delay** to respect rate limits.
  The cache is keyed by name+currency so one user's sync serves everyone.
- `lib/server/inventory-valuation.ts` — `computeInventoryValue()` ties it together
  and (unless `persist:false`) records a daily snapshot.
- `lib/server/inventory-value.ts` — storage: `recordInventoryValue()` (idempotent
  per day), `getInventoryValueHistory()` (oldest-first, for charts), `getLatestInventoryValue()`.

**Endpoints**

- `POST /api/inventory/sync` — on-demand revaluation for the current user (rate-limited).
- `GET /api/inventory/value-history` — current user's history (for the dashboard chart).
- `GET /api/inventory/items` — current user's full inventory joined with **cached**
  prices only (no live Steam Market calls). `fetchInventoryItems()` +
  `parseInventoryItems()` enrich each item with icon, rarity, type, exterior;
  `getCachedPrices()` batch-reads the price cache. Items with no cached price show
  `unitPrice: null` until the next sync/cron populates it.
- `GET /api/cron/snapshot-inventory` — daily job over all users; **Bearer `CRON_SECRET`**
  required (fails closed if the secret is unset).

**Pages**

- `/inventory` (server-guarded) renders `components/inventory/inventory-list.tsx`
  — a searchable, sortable item grid with icons, prices and a "Sync now" button.
  Each marketable card links to its detail page.
- `/inventory/[name]` (server-guarded) is the **per-item price-history detail**.
  The `[name]` segment is the `encodeURIComponent`'d `market_hash_name` — the page
  `decodeURIComponent`s it (Next does not auto-decode the raw segment). Reads
  `getItemMeta()` + `getItemPriceHistory()` straight from SQLite (no API route, no
  live Steam call) and renders `components/inventory/item-price-chart.tsx`
  (latest/low/high stats + recharts line).

**Per-item history storage**

- `item_price_history` (item, currency, day → price) accumulates one row per day,
  written by `recordItemPrice()` inside `getPrices()` on every live fetch (so it
  fills during sync/cron). Distinct from `market_price_cache`, which only holds the
  latest price. `lib/server/item-price-history.ts`.
- `item` table caches lightweight metadata (icon, rarity, type, exterior), upserted
  in a transaction by `upsertItemMeta()` whenever the user loads `/api/inventory/items`,
  so the detail page has a header without re-fetching the inventory. `lib/server/item-meta.ts`.

**Scheduling the daily snapshot.** Point any scheduler at the cron endpoint with
the secret. Either:

- Vercel Cron (`vercel.json` / `vercel.ts` `crons: [{ path: "/api/cron/snapshot-inventory", schedule: "0 6 * * *" }]`) — Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the env var is set.
- Or a system crontab: `0 6 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/snapshot-inventory`

The dashboard shows the latest value + a recharts history line
(`components/dashboard/inventory-value-panel.tsx`) with a manual "Sync now" button.

### Design system

The aesthetic lives in `app/globals.css` — a retro arcade / CRT theme:

- **Fonts**: Space Mono for body (`--font-sans` / `--font-mono`), VT323 for display
  headings (h1/h2/h3) with a soft cyan glow. Wired in `app/layout.tsx`.
- **Dark theme is the default** (`<html className="dark">`). Neon cyan + magenta on
  deep violet-black, CRT scanline overlay, vignette, sharp corners (near-zero radii).
- **Design tokens**: `surface-1` through `surface-4` (overlay layers),
  success/warning/danger (semantic), accent (primary action), chart-1..5.
- Use design tokens — avoid hardcoded `bg-white/N` or `border-white/N`.
- `--text-2xs` and `--tracking-eyebrow` exist for uppercase eyebrow labels.

### UI kit (`components/ui/`)

Generic shadcn/ui primitives carried over from the base: button, card, dialog,
select, tabs, toast/toaster, tooltip, badge, alert, progress, switch, skeleton,
surface-card, page-container, section-title, empty-state, etc. `animated-text`
wraps the `slot-text` library (slot-machine roll for changing values, with a
`prefers-reduced-motion` fallback) — used for the dashboard value figures.

### Key conventions

- Path alias: `@/*` maps to project root
- Tests live in `test/` (Vitest + @testing-library/react + jsdom)
- `server-only` is stubbed in tests via `test/server-only-stub.ts`
- `nextjs/no-img-element` oxlint rule is disabled
- All changes go through issue → branch → PR → merge (never commit directly to main)
