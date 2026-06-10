import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { InventoryValueSnapshot } from "@/lib/types/api"

interface RecordInventoryValueInput {
  /** UTC calendar day, 'YYYY-MM-DD'. Defaults to today (UTC). */
  snapshotDate?: string
  /** ISO 4217-ish code recording which unit `totalValue` is in. */
  currency?: string
  /** Total inventory value in minor units (e.g. cents). */
  totalValue: number
  itemCount?: number
  pricedItemCount?: number
}

interface HistoryRow {
  snapshot_date: string
  currency: string
  total_value: number
  item_count: number
  priced_item_count: number
  computed_at: string
}

/** Returns the current UTC calendar day as 'YYYY-MM-DD'. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function mapRow(row: HistoryRow): InventoryValueSnapshot {
  return {
    snapshotDate: row.snapshot_date,
    currency: row.currency,
    totalValue: row.total_value,
    itemCount: row.item_count,
    pricedItemCount: row.priced_item_count,
    computedAt: row.computed_at,
  }
}

/**
 * Records the inventory value for a user on a given day. Idempotent per day:
 * re-running for the same `snapshotDate` overwrites the row, so the stored
 * value always reflects the latest computation for that calendar day.
 */
export function recordInventoryValue(steamId: string, input: RecordInventoryValueInput): void {
  const db = getSqliteDatabase()

  db.prepare(
    `
    INSERT INTO inventory_value_history (
      steam_id, snapshot_date, currency, total_value, item_count, priced_item_count, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(steam_id, snapshot_date) DO UPDATE SET
      currency = excluded.currency,
      total_value = excluded.total_value,
      item_count = excluded.item_count,
      priced_item_count = excluded.priced_item_count,
      computed_at = excluded.computed_at
  `,
  ).run(
    steamId,
    input.snapshotDate ?? todayUtc(),
    input.currency ?? "USD",
    Math.round(input.totalValue),
    input.itemCount ?? 0,
    input.pricedItemCount ?? 0,
    new Date().toISOString(),
  )
}

/**
 * Returns the value history for a user, oldest first — ready to plot.
 *
 * @param options.from - inclusive lower bound 'YYYY-MM-DD'
 * @param options.to - inclusive upper bound 'YYYY-MM-DD'
 * @param options.limit - cap on the number of rows (most recent kept)
 */
export function getInventoryValueHistory(
  steamId: string,
  options?: { from?: string; to?: string; limit?: number },
): InventoryValueSnapshot[] {
  const db = getSqliteDatabase()

  const clauses = ["steam_id = ?"]
  const params: Array<string | number> = [steamId]

  if (options?.from) {
    clauses.push("snapshot_date >= ?")
    params.push(options.from)
  }
  if (options?.to) {
    clauses.push("snapshot_date <= ?")
    params.push(options.to)
  }

  // When a limit is set, take the most recent N rows (DESC + limit), then flip
  // back to chronological order so callers always get oldest-first output.
  const where = clauses.join(" AND ")
  const limit = options?.limit
  const sql = limit
    ? `SELECT * FROM (
         SELECT snapshot_date, currency, total_value, item_count, priced_item_count, computed_at
         FROM inventory_value_history WHERE ${where}
         ORDER BY snapshot_date DESC LIMIT ?
       ) ORDER BY snapshot_date ASC`
    : `SELECT snapshot_date, currency, total_value, item_count, priced_item_count, computed_at
       FROM inventory_value_history WHERE ${where}
       ORDER BY snapshot_date ASC`

  if (limit) params.push(limit)

  const rows = db.prepare(sql).all(...params) as unknown as HistoryRow[]
  return rows.map(mapRow)
}

/** Returns the most recent snapshot for a user, or null if none recorded yet. */
export function getLatestInventoryValue(steamId: string): InventoryValueSnapshot | null {
  const db = getSqliteDatabase()
  const row = db
    .prepare(
      `SELECT snapshot_date, currency, total_value, item_count, priced_item_count, computed_at
       FROM inventory_value_history WHERE steam_id = ?
       ORDER BY snapshot_date DESC LIMIT 1`,
    )
    .get(steamId) as unknown as HistoryRow | undefined

  return row ? mapRow(row) : null
}
