import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { HoldingItem, Sticker } from "@/lib/types/api"

function parseStickersJson(json: string | null): Sticker[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as Sticker[]) : []
  } catch {
    return []
  }
}

/** Returns the current UTC calendar day as 'YYYY-MM-DD'. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface HoldingInput {
  marketHashName: string
  count: number
  unitPrice: number | null
  /** Applied stickers on that item that day. Defaults to none. */
  stickers?: Sticker[]
}

/**
 * Records the full set of items a user held on a given day, including each
 * item's applied stickers — so the composition is captured per day + per item.
 * Idempotent per day: the day's rows are replaced wholesale so the snapshot
 * reflects exactly the latest sync (items that left disappear from that day).
 */
export function recordHoldings(
  steamId: string,
  options: { snapshotDate?: string; currency: string; items: HoldingInput[] },
): void {
  const db = getSqliteDatabase()
  const date = options.snapshotDate ?? todayUtc()

  const del = db.prepare("DELETE FROM inventory_holdings WHERE steam_id = ? AND snapshot_date = ?")
  const ins = db.prepare(
    `INSERT INTO inventory_holdings (steam_id, snapshot_date, market_hash_name, count, unit_price, currency, stickers)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  db.exec("BEGIN")
  try {
    del.run(steamId, date)
    for (const i of options.items) {
      const stickers = i.stickers && i.stickers.length ? JSON.stringify(i.stickers) : null
      ins.run(steamId, date, i.marketHashName, i.count, i.unitPrice, options.currency, stickers)
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

interface HoldingRow {
  market_hash_name: string
  name: string | null
  icon_url: string | null
  rarity_color: string | null
  exterior: string | null
  stickers: string | null
  count: number
  unit_price: number | null
}

/**
 * Returns a user's holdings for a specific day (defaults to their most recent
 * snapshot), ordered by line value descending and joined with item metadata
 * (name/icon) for display. Returns null `snapshotDate` when the user has no
 * holdings recorded.
 */
export function getHoldings(
  steamId: string,
  snapshotDate?: string,
): { snapshotDate: string | null; items: HoldingItem[] } {
  const db = getSqliteDatabase()

  const date =
    snapshotDate ??
    (
      db.prepare("SELECT MAX(snapshot_date) d FROM inventory_holdings WHERE steam_id = ?").get(steamId) as
        | { d: string | null }
        | undefined
    )?.d ??
    null

  if (!date) return { snapshotDate: null, items: [] }

  const rows = db
    .prepare(
      `SELECT h.market_hash_name, h.count, h.unit_price, h.stickers, i.name, i.icon_url, i.rarity_color, i.exterior
       FROM inventory_holdings h
       LEFT JOIN item i ON i.market_hash_name = h.market_hash_name
       WHERE h.steam_id = ? AND h.snapshot_date = ?
       ORDER BY (CASE WHEN h.unit_price IS NULL THEN 0 ELSE h.unit_price * h.count END) DESC, h.market_hash_name ASC`,
    )
    .all(steamId, date) as unknown as HoldingRow[]

  const items: HoldingItem[] = rows.map((r) => ({
    marketHashName: r.market_hash_name,
    name: r.name ?? r.market_hash_name,
    iconUrl: r.icon_url,
    rarityColor: r.rarity_color,
    exterior: r.exterior,
    stickers: parseStickersJson(r.stickers),
    count: r.count,
    unitPrice: r.unit_price,
    lineTotal: r.unit_price == null ? null : r.unit_price * r.count,
  }))

  return { snapshotDate: date, items }
}

/**
 * Returns the stickers from a user's most recent holdings snapshot of an item —
 * for the item detail page, which isn't day-specific.
 */
export function getLatestStickersForItem(steamId: string, marketHashName: string): Sticker[] {
  const db = getSqliteDatabase()
  const row = db
    .prepare(
      `SELECT stickers FROM inventory_holdings
       WHERE steam_id = ? AND market_hash_name = ?
       ORDER BY snapshot_date DESC LIMIT 1`,
    )
    .get(steamId, marketHashName) as { stickers: string | null } | undefined
  return parseStickersJson(row?.stickers ?? null)
}

/** Returns the dates that have a holdings snapshot for a user, newest first. */
export function getHoldingDates(steamId: string): string[] {
  const db = getSqliteDatabase()
  const rows = db
    .prepare(
      `SELECT DISTINCT snapshot_date FROM inventory_holdings WHERE steam_id = ?
       ORDER BY snapshot_date DESC`,
    )
    .all(steamId) as Array<{ snapshot_date: string }>
  return rows.map((r) => r.snapshot_date)
}
