import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"

interface UpsertProfileOptions {
  personaName?: string
  avatarUrl?: string
  profileUrl?: string
  lastLoginAt?: string
}

/** Returns the current timestamp as an ISO 8601 string. */
function nowIso() {
  return new Date().toISOString()
}

/**
 * Inserts or updates the cached public profile for a Steam user. COALESCE
 * keeps existing values when a field is omitted, so a partial update never
 * wipes data captured by a previous login.
 */
export function upsertProfile(steamId: string, options?: UpsertProfileOptions) {
  const db = getSqliteDatabase()
  const now = nowIso()

  db.prepare(
    `
    INSERT INTO steam_profile (
      steam_id,
      persona_name,
      avatar_url,
      profile_url,
      last_login_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(steam_id) DO UPDATE SET
      persona_name = COALESCE(excluded.persona_name, steam_profile.persona_name),
      avatar_url = COALESCE(excluded.avatar_url, steam_profile.avatar_url),
      profile_url = COALESCE(excluded.profile_url, steam_profile.profile_url),
      last_login_at = COALESCE(excluded.last_login_at, steam_profile.last_login_at),
      updated_at = excluded.updated_at
  `,
  ).run(
    steamId,
    options?.personaName ?? null,
    options?.avatarUrl ?? null,
    options?.profileUrl ?? null,
    options?.lastLoginAt ?? null,
    now,
    now,
  )
}

/** Returns the Steam64 ID of every user who has logged in at least once. */
export function listProfileSteamIds(): string[] {
  const db = getSqliteDatabase()
  const rows = db.prepare("SELECT steam_id FROM steam_profile").all() as Array<{ steam_id: string }>
  return rows.map((r) => r.steam_id)
}
