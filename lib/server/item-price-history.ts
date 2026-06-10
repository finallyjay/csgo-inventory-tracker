import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { ItemPricePoint } from "@/lib/types/api"

/** Returns the current UTC calendar day as 'YYYY-MM-DD'. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

interface HistoryRow {
  snapshot_date: string
  price: number
}

/**
 * Records an item's price for a given day. Idempotent per day: re-recording the
 * same (item, currency, date) overwrites with the latest price. Prices are
 * global, so this is keyed by item — not user.
 */
export function recordItemPrice(
  marketHashName: string,
  currency: string,
  price: number,
  snapshotDate: string = todayUtc(),
): void {
  const db = getSqliteDatabase()
  db.prepare(
    `INSERT INTO item_price_history (market_hash_name, currency, snapshot_date, price)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(market_hash_name, currency, snapshot_date) DO UPDATE SET
       price = excluded.price`,
  ).run(marketHashName, currency, snapshotDate, Math.round(price))
}

/**
 * Returns an item's price history, oldest-first — ready to plot.
 *
 * @param options.from - inclusive lower bound 'YYYY-MM-DD'
 * @param options.to - inclusive upper bound 'YYYY-MM-DD'
 * @param options.limit - keep only the most recent N points
 */
export function getItemPriceHistory(
  marketHashName: string,
  currency: string,
  options?: { from?: string; to?: string; limit?: number },
): ItemPricePoint[] {
  const db = getSqliteDatabase()

  const clauses = ["market_hash_name = ?", "currency = ?"]
  const params: Array<string | number> = [marketHashName, currency]

  if (options?.from) {
    clauses.push("snapshot_date >= ?")
    params.push(options.from)
  }
  if (options?.to) {
    clauses.push("snapshot_date <= ?")
    params.push(options.to)
  }

  const where = clauses.join(" AND ")
  const limit = options?.limit
  const sql = limit
    ? `SELECT * FROM (
         SELECT snapshot_date, price FROM item_price_history WHERE ${where}
         ORDER BY snapshot_date DESC LIMIT ?
       ) ORDER BY snapshot_date ASC`
    : `SELECT snapshot_date, price FROM item_price_history WHERE ${where}
       ORDER BY snapshot_date ASC`

  if (limit) params.push(limit)

  const rows = db.prepare(sql).all(...params) as unknown as HistoryRow[]
  return rows.map((r) => ({ snapshotDate: r.snapshot_date, price: r.price }))
}
