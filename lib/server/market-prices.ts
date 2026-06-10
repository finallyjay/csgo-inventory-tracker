import "server-only"

import { CS2_APP_ID, parsePriceToMinorUnits, steamCurrencyCode } from "@/lib/market"
import { getSqliteDatabase } from "@/lib/server/sqlite"
import { recordItemPrice } from "@/lib/server/item-price-history"
import { logger } from "@/lib/server/logger"

/** How long a cached price stays fresh before we refetch (12 hours). */
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

/** Delay between live Steam Market requests to respect its rate limit. */
const DEFAULT_DELAY_MS = 1500

interface CacheRow {
  price: number | null
  fetched_at: string
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Reads a cached price if present and newer than `maxAgeMs`. */
export function getCachedPrice(
  marketHashName: string,
  currency: string,
  maxAgeMs: number = DEFAULT_TTL_MS,
): { price: number | null; fetchedAt: string } | null {
  const db = getSqliteDatabase()
  const row = db
    .prepare("SELECT price, fetched_at FROM market_price_cache WHERE market_hash_name = ? AND currency = ?")
    .get(marketHashName, currency) as unknown as CacheRow | undefined

  if (!row) return null

  const age = Date.now() - new Date(row.fetched_at).getTime()
  if (age > maxAgeMs) return null

  return { price: row.price, fetchedAt: row.fetched_at }
}

/**
 * Reads whatever prices are already cached for the given names, ignoring TTL —
 * for display surfaces (e.g. the item list) that should show the last known
 * price rather than block on live fetches. Names with no cached row are absent
 * from the returned map; a present entry may be null ("no price found").
 */
export function getCachedPrices(marketHashNames: string[], currency: string): Map<string, number | null> {
  const result = new Map<string, number | null>()
  const unique = [...new Set(marketHashNames)]
  if (unique.length === 0) return result

  const db = getSqliteDatabase()
  // Chunk to stay well under SQLite's variable limit on large inventories.
  const CHUNK = 400
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const placeholders = chunk.map(() => "?").join(", ")
    const rows = db
      .prepare(
        `SELECT market_hash_name, price FROM market_price_cache
         WHERE currency = ? AND market_hash_name IN (${placeholders})`,
      )
      .all(currency, ...chunk) as unknown as Array<{ market_hash_name: string; price: number | null }>
    for (const row of rows) {
      result.set(row.market_hash_name, row.price)
    }
  }

  return result
}

/** Writes (or refreshes) a cached price. A null price records "no price found". */
export function setCachedPrice(marketHashName: string, currency: string, price: number | null): void {
  const db = getSqliteDatabase()
  db.prepare(
    `INSERT INTO market_price_cache (market_hash_name, currency, price, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(market_hash_name, currency) DO UPDATE SET
       price = excluded.price,
       fetched_at = excluded.fetched_at`,
  ).run(marketHashName, currency, price, new Date().toISOString())
}

interface PriceOverview {
  success?: boolean
  lowest_price?: string
  median_price?: string
}

/**
 * Fetches a single item's price from Steam Market's priceoverview endpoint.
 * Prefers `lowest_price`, falling back to `median_price`. Returns minor units,
 * or null if Steam reports no price.
 *
 * @throws on a non-OK HTTP response (e.g. 429) so callers can back off.
 */
export async function fetchPriceFromSteam(marketHashName: string, currency: string): Promise<number | null> {
  const url = new URL("https://steamcommunity.com/market/priceoverview/")
  url.searchParams.set("appid", String(CS2_APP_ID))
  url.searchParams.set("currency", String(steamCurrencyCode(currency)))
  url.searchParams.set("market_hash_name", marketHashName)

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) {
    throw new Error(`priceoverview returned ${res.status}`)
  }

  const data = (await res.json()) as PriceOverview
  if (!data.success) return null

  return parsePriceToMinorUnits(data.lowest_price ?? data.median_price)
}

export interface GetPricesOptions {
  /** Cache freshness window. Defaults to 12h. */
  maxAgeMs?: number
  /** Delay between live fetches (ms). Defaults to 1500. */
  delayMs?: number
  /** Hard cap on live fetches in one call (cache hits don't count). */
  maxFetches?: number
}

export interface GetPricesResult {
  /** market_hash_name → price in minor units (null = no price). */
  prices: Map<string, number | null>
  /** Number of names served from cache. */
  cacheHits: number
  /** Number of names fetched live from Steam. */
  fetched: number
  /** Names skipped because the maxFetches cap was hit. */
  skipped: string[]
}

/**
 * Resolves prices for a list of item names, serving from the shared cache when
 * fresh and otherwise fetching live from Steam (sequentially, throttled). Live
 * results are written back to the cache so other users / the next run reuse them.
 */
export async function getPrices(
  marketHashNames: string[],
  currency: string,
  options: GetPricesOptions = {},
): Promise<GetPricesResult> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_TTL_MS
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const maxFetches = options.maxFetches ?? Infinity

  const prices = new Map<string, number | null>()
  const skipped: string[] = []
  let cacheHits = 0
  let fetched = 0

  // Dedupe so repeated names cost at most one lookup.
  const uniqueNames = [...new Set(marketHashNames)]

  for (const name of uniqueNames) {
    const cached = getCachedPrice(name, currency, maxAgeMs)
    if (cached) {
      prices.set(name, cached.price)
      cacheHits++
      continue
    }

    if (fetched >= maxFetches) {
      skipped.push(name)
      continue
    }

    if (fetched > 0) await sleep(delayMs)

    try {
      const price = await fetchPriceFromSteam(name, currency)
      setCachedPrice(name, currency, price)
      // Accumulate the per-item daily price history (only when there's a price).
      if (price != null) recordItemPrice(name, currency, price)
      prices.set(name, price)
    } catch (err) {
      logger.warn({ err, name }, "Live price fetch failed; treating as no price")
      prices.set(name, null)
    }
    fetched++
  }

  return { prices, cacheHits, fetched, skipped }
}
