import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"
import type { AllowedUser } from "@/lib/types/api"

const STEAM_ID_REGEX = /^\d{17}$/

/** Returns every Steam64 ID stored in the persisted whitelist (DB only). */
export function listAllowedUsers(): AllowedUser[] {
  const db = getSqliteDatabase()
  const rows = db
    .prepare("SELECT steam_id, added_by, added_at FROM allowed_users ORDER BY added_at DESC")
    .all() as Array<{ steam_id: string; added_by: string | null; added_at: string }>

  return rows.map((r) => ({ steamId: r.steam_id, addedBy: r.added_by, addedAt: r.added_at }))
}

/**
 * Adds a Steam64 ID to the persisted whitelist. Idempotent — re-adding an
 * existing ID is a no-op. Returns false if the ID is malformed.
 */
export function addAllowedUser(steamId: string, addedBy: string | null): boolean {
  if (!STEAM_ID_REGEX.test(steamId)) return false

  const db = getSqliteDatabase()
  db.prepare(
    `INSERT INTO allowed_users (steam_id, added_by, added_at)
     VALUES (?, ?, ?)
     ON CONFLICT(steam_id) DO NOTHING`,
  ).run(steamId, addedBy, new Date().toISOString())

  return true
}

/** Removes a Steam64 ID from the persisted whitelist. */
export function removeAllowedUser(steamId: string): void {
  const db = getSqliteDatabase()
  db.prepare("DELETE FROM allowed_users WHERE steam_id = ?").run(steamId)
}
