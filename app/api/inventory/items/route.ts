import { NextResponse } from "next/server"
import { getCurrentUser } from "@/app/lib/server-auth"
import { env } from "@/lib/env"
import { fetchInventoryItems, InventoryFetchError, inventoryErrorInfo } from "@/lib/server/steam-inventory"
import { getCachedPrices } from "@/lib/server/market-prices"
import { upsertItemMeta } from "@/lib/server/item-meta"
import { logger } from "@/lib/server/logger"
import type { InventoryItemsResponse, InventoryItemView } from "@/lib/types/api"

export const maxDuration = 60

/**
 * GET /api/inventory/items
 *
 * Returns the authenticated user's full CS2 inventory, joined with prices from
 * the shared cache (no live Steam Market calls — those happen on sync / cron).
 * Items with no cached price show `unitPrice: null` until the next sync.
 *
 * @returns InventoryItemsResponse
 * @throws 401 - Not authenticated · 403 - Private inventory · 429 - Steam throttled
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const currency = env.STEAM_MARKET_CURRENCY

  let detailed
  try {
    detailed = await fetchInventoryItems(user.steamId)
  } catch (err) {
    if (err instanceof InventoryFetchError) {
      const info = inventoryErrorInfo(err.status)
      return NextResponse.json({ error: info.message }, { status: info.status })
    }
    logger.error({ err, steamId: user.steamId }, "Inventory items fetch failed")
    return NextResponse.json({ error: "Failed to load inventory." }, { status: 500 })
  }

  // Persist lightweight metadata so the per-item detail page can render a header
  // without re-fetching the whole inventory.
  upsertItemMeta(
    detailed.items
      .filter((i) => i.marketHashName)
      .map((i) => ({
        marketHashName: i.marketHashName as string,
        name: i.name,
        iconUrl: i.iconUrl,
        rarity: i.rarity,
        rarityColor: i.rarityColor,
        type: i.type,
        exterior: i.exterior,
      })),
  )

  const priceable = detailed.items.filter((i) => i.marketHashName).map((i) => i.marketHashName as string)
  const prices = getCachedPrices(priceable, currency)

  let totalValue = 0
  let pricedRows = 0

  const items: InventoryItemView[] = detailed.items.map((i) => {
    const unitPrice = i.marketHashName ? (prices.get(i.marketHashName) ?? null) : null
    const lineTotal = unitPrice == null ? null : unitPrice * i.count
    if (lineTotal != null) {
      totalValue += lineTotal
      pricedRows++
    }
    return {
      key: i.key,
      name: i.name,
      marketHashName: i.marketHashName,
      iconUrl: i.iconUrl,
      marketable: i.marketable,
      count: i.count,
      rarity: i.rarity,
      rarityColor: i.rarityColor,
      type: i.type,
      exterior: i.exterior,
      stickers: i.stickers,
      unitPrice,
      lineTotal,
    }
  })

  const response: InventoryItemsResponse = {
    items,
    currency,
    totalItemCount: detailed.totalItemCount,
    totalValue,
    pricedRows,
    needsSync: pricedRows === 0 && items.some((i) => i.marketable),
  }

  return NextResponse.json(response)
}
