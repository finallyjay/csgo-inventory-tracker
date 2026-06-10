import { NextResponse } from "next/server"
import { getCurrentUser } from "@/app/lib/server-auth"
import { env } from "@/lib/env"
import { computeInventoryValue } from "@/lib/server/inventory-valuation"
import { InventoryFetchError, inventoryErrorInfo } from "@/lib/server/steam-inventory"
import { rateLimit } from "@/lib/server/rate-limit"
import { logger } from "@/lib/server/logger"

export const maxDuration = 300

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
    const result = await computeInventoryValue(user.steamId, { currency: env.STEAM_MARKET_CURRENCY })
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
