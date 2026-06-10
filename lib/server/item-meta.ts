import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { ItemMeta } from "@/lib/types/api"

export interface ItemMetaInput {
  marketHashName: string
  name: string
  iconUrl: string | null
  rarity: string | null
  rarityColor: string | null
  type: string | null
  exterior: string | null
}

/**
 * Batch-upserts item metadata in a single transaction. COALESCE keeps existing
 * non-null values when an incoming field is null, so partial data never wipes a
 * richer earlier capture.
 */
export function upsertItemMeta(items: ItemMetaInput[]): void {
  if (items.length === 0) return

  const db = getSqliteDatabase()
  const now = new Date().toISOString()
  const stmt = db.prepare(
    `INSERT INTO item (market_hash_name, name, icon_url, rarity, rarity_color, type, exterior, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(market_hash_name) DO UPDATE SET
       name = COALESCE(excluded.name, item.name),
       icon_url = COALESCE(excluded.icon_url, item.icon_url),
       rarity = COALESCE(excluded.rarity, item.rarity),
       rarity_color = COALESCE(excluded.rarity_color, item.rarity_color),
       type = COALESCE(excluded.type, item.type),
       exterior = COALESCE(excluded.exterior, item.exterior),
       updated_at = excluded.updated_at`,
  )

  db.exec("BEGIN")
  try {
    for (const i of items) {
      stmt.run(i.marketHashName, i.name, i.iconUrl, i.rarity, i.rarityColor, i.type, i.exterior, now)
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

interface MetaRow {
  market_hash_name: string
  name: string | null
  icon_url: string | null
  rarity: string | null
  rarity_color: string | null
  type: string | null
  exterior: string | null
}

/** Returns stored metadata for an item, or null if we've never seen it. */
export function getItemMeta(marketHashName: string): ItemMeta | null {
  const db = getSqliteDatabase()
  const row = db
    .prepare(
      `SELECT market_hash_name, name, icon_url, rarity, rarity_color, type, exterior
       FROM item WHERE market_hash_name = ?`,
    )
    .get(marketHashName) as unknown as MetaRow | undefined

  if (!row) return null

  return {
    marketHashName: row.market_hash_name,
    name: row.name ?? row.market_hash_name,
    iconUrl: row.icon_url,
    rarity: row.rarity,
    rarityColor: row.rarity_color,
    type: row.type,
    exterior: row.exterior,
  }
}
