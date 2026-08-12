import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"

import { MIGRATIONS, LATEST_VERSION, runMigrations } from "@/lib/server/migrations"

function userVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number }
  return row.user_version
}

function tableNames(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_"))
}

/** The SQL a legacy database (pre-migrations) would already contain. Mirrors
 * exactly what the app used to create at startup, but leaves user_version at 0. */
const LEGACY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS steam_profile (
    steam_id TEXT PRIMARY KEY,
    persona_name TEXT,
    avatar_url TEXT,
    profile_url TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS allowed_users (
    steam_id TEXT PRIMARY KEY,
    added_by TEXT,
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_value_history (
    steam_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    total_value INTEGER NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    priced_item_count INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (steam_id, snapshot_date),
    FOREIGN KEY (steam_id) REFERENCES steam_profile(steam_id)
  );
  CREATE TABLE IF NOT EXISTS market_price_cache (
    market_hash_name TEXT NOT NULL,
    currency TEXT NOT NULL,
    price INTEGER,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (market_hash_name, currency)
  );
  CREATE TABLE IF NOT EXISTS item_price_history (
    market_hash_name TEXT NOT NULL,
    currency TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    price INTEGER NOT NULL,
    PRIMARY KEY (market_hash_name, currency, snapshot_date)
  );
  CREATE TABLE IF NOT EXISTS item (
    market_hash_name TEXT PRIMARY KEY,
    name TEXT,
    icon_url TEXT,
    rarity TEXT,
    rarity_color TEXT,
    type TEXT,
    exterior TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_holdings (
    steam_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    market_hash_name TEXT NOT NULL,
    count INTEGER NOT NULL,
    unit_price INTEGER,
    currency TEXT NOT NULL,
    stickers TEXT,
    PRIMARY KEY (steam_id, snapshot_date, market_hash_name)
  );
`

describe("migration list integrity", () => {
  it("is a gap-free, strictly-increasing list starting at 1", () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1))
  })

  it("LATEST_VERSION equals the highest migration version", () => {
    expect(LATEST_VERSION).toBe(MIGRATIONS[MIGRATIONS.length - 1].version)
    expect(LATEST_VERSION).toBeGreaterThanOrEqual(1)
  })
})

describe("runMigrations on a fresh database", () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(":memory:")
  })

  afterEach(() => {
    db.close()
  })

  it("starts at user_version 0", () => {
    expect(userVersion(db)).toBe(0)
  })

  it("brings a brand-new database up to the latest version", () => {
    runMigrations(db)
    expect(userVersion(db)).toBe(LATEST_VERSION)
  })

  it("creates every table the app needs", () => {
    runMigrations(db)
    expect(tableNames(db)).toEqual([
      "allowed_users",
      "inventory_holdings",
      "inventory_raw_cache",
      "inventory_value_history",
      "item",
      "item_price_history",
      "market_price_cache",
      "steam_profile",
    ])
  })

  it("is idempotent: running again is a no-op and does not throw", () => {
    runMigrations(db)
    const before = tableNames(db)
    expect(() => runMigrations(db)).not.toThrow()
    expect(userVersion(db)).toBe(LATEST_VERSION)
    expect(tableNames(db)).toEqual(before)
  })
})

describe("runMigrations on a legacy (pre-migrations) database", () => {
  let db: DatabaseSync

  beforeEach(() => {
    // Simulate a database created by the old startup code: tables exist, but
    // user_version was never stamped, so it is still 0.
    db = new DatabaseSync(":memory:")
    db.exec(LEGACY_SCHEMA_SQL)
    expect(userVersion(db)).toBe(0)
  })

  afterEach(() => {
    db.close()
  })

  it("stamps the version to the latest without losing existing data", () => {
    // Seed data that predates the migration system.
    db.exec(
      `INSERT INTO steam_profile (steam_id, persona_name, created_at, updated_at)
       VALUES ('76561197960287930', 'legacy-user', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    )
    db.exec(
      `INSERT INTO inventory_value_history (steam_id, snapshot_date, currency, total_value, computed_at)
       VALUES ('76561197960287930', '2026-01-01', 'USD', 12345, '2026-01-01T00:00:00Z')`,
    )

    runMigrations(db)

    expect(userVersion(db)).toBe(LATEST_VERSION)

    const profile = db
      .prepare("SELECT persona_name FROM steam_profile WHERE steam_id = ?")
      .get("76561197960287930") as { persona_name: string }
    expect(profile.persona_name).toBe("legacy-user")

    const history = db
      .prepare("SELECT total_value FROM inventory_value_history WHERE steam_id = ?")
      .get("76561197960287930") as { total_value: number }
    expect(history.total_value).toBe(12345)
  })

  it("v2 adds inventory_raw_cache to a database already at v1", () => {
    // Bring the legacy database to v1 only, then let a full run apply v2.
    db.exec("PRAGMA user_version = 1")
    expect(tableNames(db)).not.toContain("inventory_raw_cache")

    runMigrations(db)

    expect(userVersion(db)).toBe(LATEST_VERSION)
    expect(tableNames(db)).toContain("inventory_raw_cache")
  })

  it("converges to the same schema as a fresh database", () => {
    runMigrations(db)

    const fresh = new DatabaseSync(":memory:")
    runMigrations(fresh)

    expect(tableNames(db)).toEqual(tableNames(fresh))
    expect(userVersion(db)).toBe(userVersion(fresh))
    fresh.close()
  })
})

describe("getSqliteDatabase integration (fresh file on disk)", () => {
  const dbPath = join(tmpdir(), `csgo-migrations-test-${process.pid}.sqlite`)
  const originalSqlitePath = process.env.SQLITE_PATH
  let opened: DatabaseSync | undefined

  beforeAll(() => {
    process.env.SQLITE_PATH = dbPath
  })

  afterAll(() => {
    // Close the cached connection before deleting its files, and restore the
    // original SQLITE_PATH so this test doesn't leak state to other files.
    opened?.close()
    if (originalSqlitePath === undefined) delete process.env.SQLITE_PATH
    else process.env.SQLITE_PATH = originalSqlitePath
    for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
  })

  it("opens a real file at the latest version with all tables", async () => {
    const { getSqliteDatabase } = await import("@/lib/server/sqlite")
    opened = getSqliteDatabase()
    expect(userVersion(opened)).toBe(LATEST_VERSION)
    expect(tableNames(opened)).toContain("steam_profile")
    expect(tableNames(opened)).toContain("inventory_holdings")
  })
})
