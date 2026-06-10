import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/app/lib/server-auth"
import { getInventoryValueHistory } from "@/lib/server/inventory-value"
import type { InventoryValueHistoryResponse } from "@/lib/types/api"

/**
 * GET /api/inventory/value-history
 *
 * Returns the authenticated user's inventory value history, oldest-first.
 *
 * @query from - inclusive lower bound 'YYYY-MM-DD' (optional)
 * @query to - inclusive upper bound 'YYYY-MM-DD' (optional)
 * @query limit - max number of most-recent snapshots (optional)
 * @returns {{ history: InventoryValueSnapshot[] }}
 * @throws 401 - Not authenticated
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const limitRaw = sp.get("limit")
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

  const history = getInventoryValueHistory(user.steamId, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  })

  const response: InventoryValueHistoryResponse = { history }
  return NextResponse.json(response)
}
