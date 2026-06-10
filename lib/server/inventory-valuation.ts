import "server-only"

import { fetchInventoryItems } from "@/lib/server/steam-inventory"
import { getPrices, type GetPricesOptions } from "@/lib/server/market-prices"
import { recordInventoryValue } from "@/lib/server/inventory-value"
import { recordHoldings } from "@/lib/server/inventory-holdings"
import { logger } from "@/lib/server/logger"
import type { Sticker } from "@/lib/types/api"

export interface ValuationResult {
  currency: string
  /** Total value in minor units (e.g. cents). */
  totalValue: number
  /** Every asset in the inventory, marketable or not. */
  itemCount: number
  /** Item instances we found a market price for. */
  pricedItemCount: number
  /** Unique marketable names whose price was missing. */
  unpricedNames: number
}

export interface ComputeOptions extends GetPricesOptions {
  currency?: string
  /** Snapshot day 'YYYY-MM-DD'; defaults to today (UTC) inside recordInventoryValue. */
  snapshotDate?: string
  /** When false, computes the value without writing a snapshot. Defaults to true. */
  persist?: boolean
}

/**
 * Fetches a user's CS2 inventory, values it against the day's Steam Market
 * prices (cached + throttled), and — unless `persist` is false — records a
 * daily snapshot via {@link recordInventoryValue}.
 *
 * @throws InventoryFetchError if the inventory can't be fetched (private/429).
 */
export async function computeInventoryValue(steamId: string, options: ComputeOptions = {}): Promise<ValuationResult> {
  const currency = options.currency ?? "USD"
  const detailed = await fetchInventoryItems(steamId)

  // Aggregate marketable items by market_hash_name (the detailed parse splits
  // sticker variants), keeping a representative sticker set per name.
  const byName = new Map<string, { count: number; stickers: Sticker[] }>()
  for (const it of detailed.items) {
    if (!it.marketable || !it.marketHashName) continue
    const cur = byName.get(it.marketHashName)
    if (cur) {
      cur.count += it.count
      if (cur.stickers.length === 0 && it.stickers.length > 0) cur.stickers = it.stickers
    } else {
      byName.set(it.marketHashName, { count: it.count, stickers: it.stickers })
    }
  }

  const { prices } = await getPrices([...byName.keys()], currency, options)

  let totalValue = 0
  let pricedItemCount = 0
  let unpricedNames = 0

  for (const [name, info] of byName) {
    const price = prices.get(name)
    if (price == null) {
      unpricedNames++
      continue
    }
    totalValue += price * info.count
    pricedItemCount += info.count
  }

  const result: ValuationResult = {
    currency,
    totalValue,
    itemCount: detailed.totalItemCount,
    pricedItemCount,
    unpricedNames,
  }

  if (options.persist !== false) {
    recordInventoryValue(steamId, {
      snapshotDate: options.snapshotDate,
      currency,
      totalValue,
      itemCount: result.itemCount,
      pricedItemCount,
    })
    // Daily composition snapshot: items held, unit price, and stickers that day.
    recordHoldings(steamId, {
      snapshotDate: options.snapshotDate,
      currency,
      items: [...byName.entries()].map(([name, info]) => ({
        marketHashName: name,
        count: info.count,
        unitPrice: prices.get(name) ?? null,
        stickers: info.stickers,
      })),
    })
    logger.info({ steamId, totalValue, currency, itemCount: result.itemCount }, "Recorded inventory value snapshot")
  }

  return result
}
