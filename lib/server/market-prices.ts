import "server-only"

import { CS2_APP_ID, parsePriceToMinorUnits, steamCurrencyCode } from "@/lib/market"
import { getSqliteDatabase } from "@/lib/server/sqlite"
import { logger } from "@/lib/server/logger"

/** How long a cached price stays fresh before we refetch (12 hours). */
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

/** Delay between live Steam Market requests to respect its rate limit. */
const DEFAULT_DELAY_MS = 1500

/** Upper bound on how long we'll honour a `Retry-After` before giving up. */
const MAX_BACKOFF_MS = 30_000

/**
 * A non-OK HTTP response from Steam's priceoverview endpoint. Carries the
 * status (so callers can special-case 429 rate limiting) and any parsed
 * `Retry-After` delay in milliseconds.
 */
export class SteamPriceHttpError extends Error {
  readonly status: number
  readonly retryAfterMs?: number

  constructor(status: number, retryAfterMs?: number) {
    super(`priceoverview returned ${status}`)
    this.name = "SteamPriceHttpError"
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Parses an HTTP `Retry-After` header into milliseconds. Supports both the
 * delta-seconds form ("120") and the HTTP-date form. Returns undefined when the
 * header is absent or unparseable. Shared with the inventory fetcher's backoff
 * (`fetchWithBackoff` in steam-inventory.ts).
 */
export function parseRetryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined

  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.max(0, date - now)
  }

  return undefined
}

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

  // Fresh iff strictly younger than maxAgeMs, so maxAgeMs: 0 always refetches.
  const age = Date.now() - new Date(row.fetched_at).getTime()
  if (age >= maxAgeMs) return null

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
 * @throws {SteamPriceHttpError} on a non-OK HTTP response (e.g. 429) so callers
 *   can inspect the status / Retry-After and back off.
 */
export async function fetchPriceFromSteam(marketHashName: string, currency: string): Promise<number | null> {
  const url = new URL("https://steamcommunity.com/market/priceoverview/")
  url.searchParams.set("appid", String(CS2_APP_ID))
  url.searchParams.set("currency", String(steamCurrencyCode(currency)))
  url.searchParams.set("market_hash_name", marketHashName)

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) {
    throw new SteamPriceHttpError(res.status, parseRetryAfterMs(res.headers.get("retry-after")))
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
  /**
   * Hard cap on live HTTP requests to Steam in one call (cache hits don't
   * count). Counts every attempt, including a 429 backoff-retry, so a caller
   * relying on this to bound wall-clock time gets that guarantee even when
   * Steam is rate-limiting us mid-run.
   */
  maxFetches?: number
}

export interface GetPricesResult {
  /** market_hash_name → price in minor units (null = no price). */
  prices: Map<string, number | null>
  /** Number of names served from cache. */
  cacheHits: number
  /** Number of names fetched live from Steam. */
  fetched: number
  /** Names skipped because the maxFetches cap was hit or Steam rate-limited us. */
  skipped: string[]
  /** True if Steam returned a 429 and we stopped issuing further live fetches. */
  rateLimited: boolean
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
  let rateLimited = false
  // Every live HTTP request counts here, including a 429 backoff-retry —
  // unlike `fetched` (names resolved), this is what maxFetches bounds, so a
  // caller's time budget holds even when a chunk of names get rate-limited
  // and retried mid-run.
  let attempts = 0

  // Dedupe so repeated names cost at most one lookup.
  const uniqueNames = [...new Set(marketHashNames)]

  for (const name of uniqueNames) {
    const cached = getCachedPrice(name, currency, maxAgeMs)
    if (cached) {
      prices.set(name, cached.price)
      cacheHits++
      continue
    }

    // Stop issuing live fetches once the cap is hit or Steam has rate-limited
    // us. Cached names above still resolve; everything else is reported skipped.
    if (rateLimited || attempts >= maxFetches) {
      skipped.push(name)
      continue
    }

    if (attempts > 0) await sleep(delayMs)

    // At most one Retry-After backoff+retry per name; a persistent 429 aborts
    // the run so we stop hammering an already rate-limited Steam.
    let retriedAfterBackoff = false
    let resolved = false
    while (!resolved) {
      attempts++
      try {
        const price = await fetchPriceFromSteam(name, currency)
        setCachedPrice(name, currency, price)
        prices.set(name, price)
        fetched++
        resolved = true
      } catch (err) {
        if (err instanceof SteamPriceHttpError && err.status === 429) {
          if (!retriedAfterBackoff && err.retryAfterMs != null && attempts < maxFetches) {
            // Steam told us how long to wait: honour it and retry once (only
            // if that retry still fits under the cap). If the retry succeeds
            // we carry on normally (no abort).
            retriedAfterBackoff = true
            const backoff = Math.min(err.retryAfterMs, MAX_BACKOFF_MS)
            logger.warn({ name, backoff }, "Steam rate-limited (429); backing off before one retry")
            await sleep(backoff)
            continue // retry this same name once
          }
          skipped.push(name)
          if (attempts >= maxFetches) {
            // Our own fetch cap ran out while deciding whether to retry — not
            // Steam persistently throttling us, so don't report `rateLimited`.
            // The outer per-name gate above will skip everything after this too.
            logger.warn({ name }, "Fetch cap reached mid-retry; skipping remaining live price fetches")
          } else {
            // No Retry-After, or the retry also 429'd: abort further live
            // fetches so we stop hammering an already rate-limited Steam.
            rateLimited = true
            logger.warn({ name }, "Steam rate-limited (429); aborting remaining live price fetches")
          }
          resolved = true
        } else {
          logger.warn({ err, name }, "Live price fetch failed; treating as no price")
          prices.set(name, null)
          fetched++
          resolved = true
        }
      }
    }
  }

  return { prices, cacheHits, fetched, skipped, rateLimited }
}
