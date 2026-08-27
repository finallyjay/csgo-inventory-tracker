import { NextResponse } from "next/server"
import { getCurrentUser } from "@/app/lib/server-auth"
import { env } from "@/lib/env"
import { computeInventoryValue } from "@/lib/server/inventory-valuation"
import { InventoryFetchError, inventoryErrorInfo } from "@/lib/server/steam-inventory"
import { rateLimit } from "@/lib/server/rate-limit"
import { logger } from "@/lib/server/logger"

export const maxDuration = 300

/**
 * Max age of a cached price a manual "Sync now" will accept before refetching
 * it live (10 minutes). Matches `INVENTORY_CACHE_TTL_MS`
 * (steam-inventory-cache.ts): the raw inventory behind this same request can't
 * get any fresher than that 10-minute window, so refusing prices older than
 * the same window is the tightest freshness "Sync now" can honestly promise —
 * without it, a click seconds after the daily cron (or another user's sync)
 * re-fetches every price live for no benefit. Deliberately tighter than
 * `SNAPSHOT_MAX_PRICE_AGE_MS` (1h), which only needs to keep the automated
 * daily snapshot from looking byte-for-byte identical day over day.
 */
const SYNC_MAX_PRICE_AGE_MS = 10 * 60 * 1000

/**
 * Hard cap on live Steam fetches per sync call. Each live fetch costs ~1.5s
 * sequentially (`DEFAULT_DELAY_MS` in market-prices.ts), and this route's
 * `maxDuration` is 300s, so an inventory with many uncached names could
 * otherwise run right up against (or past) the timeout. 150 fetches costs
 * ~225s of delay alone, leaving headroom for request/DB latency; names beyond
 * the cap are reported as skipped by `getPrices` and simply count as unpriced
 * for this run — the next cron pass or sync fills them in.
 */
const SYNC_MAX_PRICE_FETCHES = 150

/**
 * POST /api/inventory/sync
 *
 * Values the authenticated user's CS2 inventory at today's Steam Market prices
 * and records a snapshot. Useful for an on-demand refresh; the daily cron does
 * the same for everyone.
 *
 * @ratelimit 3 requests per 5 minutes per user
 * @returns ValuationResult
 * @throws 401 - Not authenticated · 403 - Private inventory · 429 - Rate limited / Steam throttled
 */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { success } = rateLimit(`inv-sync:${user.steamId}`, 3, 5 * 60_000)
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 })
  }

  try {
    // Explicit user action: refetch any price cached more than 10 minutes ago
    // (SYNC_MAX_PRICE_AGE_MS) instead of the 12h display cache, so "Sync now"
    // reflects near-live Steam Market prices. This does NOT bypass the 10-min
    // raw *inventory* cache (steam-inventory-cache.ts) — repeated clicks reuse
    // the same fetched inventory; only prices older than the window above get
    // refetched. The 3-per-5-min rate limit above, plus the fetch cap, keep
    // this from hammering Steam or running past maxDuration.
    const result = await computeInventoryValue(user.steamId, {
      currency: env.STEAM_MARKET_CURRENCY,
      maxAgeMs: SYNC_MAX_PRICE_AGE_MS,
      maxFetches: SYNC_MAX_PRICE_FETCHES,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof InventoryFetchError) {
      const info = inventoryErrorInfo(err.status)
      return NextResponse.json({ error: info.message }, { status: info.status })
    }
    logger.error({ err, steamId: user.steamId }, "Inventory sync failed")
    return NextResponse.json({ error: "Failed to value inventory." }, { status: 500 })
  }
}
