import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"
import { listProfileSteamIds } from "@/lib/server/profile"
import { computeInventoryValue } from "@/lib/server/inventory-valuation"
import { InventoryFetchError } from "@/lib/server/steam-inventory"
import { logger } from "@/lib/server/logger"

// Inventory + market pricing for many users can take a while (throttled Steam
// Market calls), so give this route plenty of headroom.
export const maxDuration = 300

/**
 * GET /api/cron/snapshot-inventory
 *
 * Daily job: for every user who has logged in, value their CS2 inventory at the
 * day's Steam Market prices and record a snapshot. Authenticated with a Bearer
 * token matching CRON_SECRET (Vercel Cron sends this automatically when the env
 * var is set). If CRON_SECRET is unset, the route is refused — fail closed.
 *
 * @returns {{ processed, recorded, failures }} summary
 * @throws 401 - Missing/invalid bearer token · 503 - CRON_SECRET not configured
 */
export async function GET(request: NextRequest) {
  const secret = env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const currency = env.STEAM_MARKET_CURRENCY
  const steamIds = listProfileSteamIds()

  let recorded = 0
  const failures: Array<{ steamId: string; reason: string }> = []

  for (const steamId of steamIds) {
    try {
      await computeInventoryValue(steamId, { currency })
      recorded++
    } catch (err) {
      const reason = err instanceof InventoryFetchError ? `inventory ${err.status}` : "error"
      failures.push({ steamId, reason })
      logger.warn({ err, steamId }, "Snapshot failed for user")
    }
  }

  logger.info({ processed: steamIds.length, recorded, failed: failures.length }, "Inventory snapshot cron complete")
  return NextResponse.json({ processed: steamIds.length, recorded, failures })
}
