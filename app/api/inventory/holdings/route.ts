import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/app/lib/server-auth"
import { env } from "@/lib/env"
import { getHoldings, getHoldingDates } from "@/lib/server/inventory-holdings"
import type { InventoryHoldingsResponse } from "@/lib/types/api"

/**
 * GET /api/inventory/holdings
 *
 * Returns the authenticated user's recorded holdings for a day (defaults to the
 * most recent snapshot), plus the list of dates that have a snapshot. Reads only
 * from the DB — no live Steam call.
 *
 * @query date - 'YYYY-MM-DD' to view a specific day (optional)
 * @returns InventoryHoldingsResponse
 * @throws 401 - Not authenticated
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined
  const { snapshotDate, items } = getHoldings(user.steamId, date)
  const totalValue = items.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0)

  const response: InventoryHoldingsResponse = {
    snapshotDate,
    currency: env.STEAM_MARKET_CURRENCY,
    items,
    totalValue,
    availableDates: getHoldingDates(user.steamId),
  }

  return NextResponse.json(response)
}
