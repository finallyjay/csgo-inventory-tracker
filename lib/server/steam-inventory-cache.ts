import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { RawInventoryResponse } from "@/lib/server/steam-inventory"

/**
 * How long a cached raw inventory stays fresh (10 minutes). Long enough to
 * absorb repeated "Sync now" clicks and items-page loads without re-hitting
 * Steam's per-IP rate limit; short next to how slowly an inventory actually
 * changes (Steam hides new acquisitions from the public endpoint for ~10 days).
 */
export const INVENTORY_CACHE_TTL_MS = 10 * 60 * 1000

interface CacheRow {
  payload: string
  fetched_at: string
}

/** Reads the cached raw inventory if present and newer than `maxAgeMs`. */
export function getCachedRawInventory(
  steamId: string,
  maxAgeMs: number = INVENTORY_CACHE_TTL_MS,
): RawInventoryResponse | null {
  const db = getSqliteDatabase()
  const row = db
    .prepare("SELECT payload, fetched_at FROM inventory_raw_cache WHERE steam_id = ?")
    .get(steamId) as unknown as CacheRow | undefined

  if (!row) return null

  // Fresh iff strictly younger than maxAgeMs, so maxAgeMs: 0 always misses.
  const age = Date.now() - new Date(row.fetched_at).getTime()
  if (age >= maxAgeMs) return null

  try {
    return JSON.parse(row.payload) as RawInventoryResponse
  } catch {
    return null
  }
}

/** Writes (or refreshes) the cached raw inventory for a user. */
export function setCachedRawInventory(steamId: string, raw: RawInventoryResponse): void {
  const db = getSqliteDatabase()
  db.prepare(
    `INSERT INTO inventory_raw_cache (steam_id, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(steam_id) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at`,
  ).run(steamId, JSON.stringify(raw), new Date().toISOString())
}
