import "server-only"

import { accessSync, constants, mkdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { dirname, join } from "node:path"

let database: DatabaseSync | null = null

function getDatabasePath() {
  if (process.env.SQLITE_PATH) {
    return process.env.SQLITE_PATH
  }

  const containerDataDir = "/data"
  try {
    accessSync(containerDataDir, constants.W_OK)
    return join(containerDataDir, "csgo-inventory-tracker.sqlite")
  } catch {
    return join(process.cwd(), ".data", "csgo-inventory-tracker.sqlite")
  }
}

/**
 * Creates every table the app needs. All statements use
 * `CREATE TABLE IF NOT EXISTS`, so this runs on every startup as an
 * idempotent no-op once the schema is in place.
 *
 * - `steam_profile` — cached public profile of every user who has logged in
 * - `allowed_users` — the persisted whitelist (env var is an additional fallback)
 * - `inventory_value_history` — one daily snapshot of total inventory value per user
 */
function createBaseSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

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

    -- One row per (user, day). Stores the total inventory value as valued by
    -- that day's market. Money is kept in integer minor units (e.g. cents) to
    -- avoid floating-point drift; 'currency' records which unit it is. Re-running
    -- a snapshot on the same day overwrites the row (latest computation wins).
    CREATE TABLE IF NOT EXISTS inventory_value_history (
      steam_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,                 -- 'YYYY-MM-DD' (UTC)
      currency TEXT NOT NULL DEFAULT 'USD',
      total_value INTEGER NOT NULL,                -- minor units (e.g. cents)
      item_count INTEGER NOT NULL DEFAULT 0,       -- total items in the inventory
      priced_item_count INTEGER NOT NULL DEFAULT 0,-- items we had a market price for
      computed_at TEXT NOT NULL,                   -- ISO timestamp of computation
      PRIMARY KEY (steam_id, snapshot_date),
      FOREIGN KEY (steam_id) REFERENCES steam_profile(steam_id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_value_history_steam_date
      ON inventory_value_history (steam_id, snapshot_date);

    -- Shared market-price cache keyed by item name + currency. Steam Market
    -- prices are the same for everyone, so caching here lets one user's sync
    -- (or the daily cron) serve prices to every other user and stay under
    -- Steam's aggressive rate limits. 'price' is in minor units; NULL price
    -- means "fetched but Steam had no price" (unmarketable / no listings).
    CREATE TABLE IF NOT EXISTS market_price_cache (
      market_hash_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      price INTEGER,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (market_hash_name, currency)
    );

    -- Per-item daily price history. Unlike market_price_cache (which only keeps
    -- the latest price), this accumulates one row per (item, currency, day) so
    -- we can chart how a single item's price moves over time. Prices are global
    -- (not per-user); recorded on every live fetch during sync / cron.
    CREATE TABLE IF NOT EXISTS item_price_history (
      market_hash_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,   -- 'YYYY-MM-DD' (UTC)
      price INTEGER NOT NULL,        -- minor units (e.g. cents)
      PRIMARY KEY (market_hash_name, currency, snapshot_date)
    );

    CREATE INDEX IF NOT EXISTS idx_item_price_history_name_currency
      ON item_price_history (market_hash_name, currency, snapshot_date);

    -- Lightweight item metadata (icon, rarity, type…) captured whenever a user
    -- views their inventory. Lets the per-item detail page render a header
    -- without re-fetching the whole Steam inventory.
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

    -- Daily snapshot of which items a user held and at what unit price. Unlike
    -- inventory_value_history (one total per day), this records the full
    -- composition so a past day can be reconstructed and item-level changes
    -- explained. Idempotent per day: a re-sync replaces that day's rows.
    -- 'stickers' holds the applied stickers (JSON) for that item on that day, so
    -- the composition is captured per day + per item — stickers a weapon had on
    -- one day but not another are preserved exactly as they were.
    CREATE TABLE IF NOT EXISTS inventory_holdings (
      steam_id TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,        -- 'YYYY-MM-DD' (UTC)
      market_hash_name TEXT NOT NULL,
      count INTEGER NOT NULL,
      unit_price INTEGER,                 -- minor units; null if unpriced that day
      currency TEXT NOT NULL,
      stickers TEXT,                      -- JSON array of { name, image }
      PRIMARY KEY (steam_id, snapshot_date, market_hash_name)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_holdings_steam_date
      ON inventory_holdings (steam_id, snapshot_date);
  `)
}

/** Returns the shared SQLite connection, creating the schema on first use. */
export function getSqliteDatabase(): DatabaseSync {
  if (database) return database

  const dbPath = getDatabasePath()
  mkdirSync(dirname(dbPath), { recursive: true })

  database = new DatabaseSync(dbPath)
  createBaseSchema(database)

  return database
}
