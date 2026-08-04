import "server-only"

import type { DatabaseSync } from "node:sqlite"

import { logger } from "@/lib/server/logger"

/**
 * A single, versioned schema migration.
 *
 * Migrations form an append-only, strictly-ordered list. Each one is applied
 * exactly once, in ascending `version` order, inside its own transaction. The
 * highest version that has been applied is recorded in SQLite's built-in
 * `PRAGMA user_version` counter, so no bookkeeping table is required.
 *
 * ─── How to add a new migration ─────────────────────────────────────────────
 *  1. Append a new entry to the `MIGRATIONS` array below. Never edit, reorder,
 *     or delete an existing migration — a released migration is immutable, the
 *     same way a git commit is. Editing one would make already-migrated
 *     databases diverge from fresh ones.
 *  2. Give it `version: <previous + 1>` and a short, descriptive `name`.
 *  3. Put the schema change in `up(db)`. Prefer additive, reversible-in-spirit
 *     DDL (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`). Write
 *     the statements so re-running on a database that already has the change is
 *     harmless where practical (e.g. `CREATE ... IF NOT EXISTS`), but the runner
 *     already guarantees each migration runs at most once per database.
 *  4. Do NOT put connection-level pragmas (`journal_mode`, `synchronous`,
 *     `foreign_keys`) here — those are applied on every connection in
 *     `sqlite.ts` and cannot run inside a transaction.
 *  5. Add / extend a test in `test/migrations.test.ts`.
 */
export interface Migration {
  /** Monotonically increasing, gap-free, starting at 1. */
  version: number
  /** Human-readable label, purely for logs. */
  name: string
  /** Applies the schema change. Runs inside a transaction opened by the runner. */
  up: (db: DatabaseSync) => void
}

/**
 * Ordered list of every migration this app knows about.
 *
 * v1 is the "initial" schema. It is intentionally identical to the schema the
 * app shipped with before migrations existed and every statement uses
 * `IF NOT EXISTS`. That makes it converge for both cases:
 *   • a brand-new database → the tables/indexes are created, then user_version
 *     is stamped to 1;
 *   • a database that predates this migration system (tables already present,
 *     user_version still 0) → every `CREATE ... IF NOT EXISTS` is a no-op, no
 *     data is touched, and user_version is stamped to 1.
 * Either way the database ends at version 1 with the exact same schema and no
 * data loss.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial schema",
    up(db) {
      db.exec(`
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
    },
  },
]

/** The version a fully-migrated database should be at. */
export const LATEST_VERSION: number = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)

function getUserVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined
  return Number(row?.user_version ?? 0)
}

/**
 * Applies every migration whose version is greater than the database's current
 * `user_version`, in ascending order, each in its own transaction. Migrations
 * already applied are skipped. On any error the in-flight migration's
 * transaction is rolled back (including its `user_version` bump), leaving the
 * database at the last cleanly-applied version, and the error is re-thrown.
 *
 * The `MIGRATIONS` list is validated to be gap-free and strictly increasing so
 * a mistake in the source is caught loudly rather than silently skipping steps.
 */
export function runMigrations(db: DatabaseSync): void {
  // Validate the migration list itself: versions must be 1, 2, 3, … with no
  // gaps or duplicates. This guards against editing mistakes.
  MIGRATIONS.forEach((migration, index) => {
    const expected = index + 1
    if (migration.version !== expected) {
      throw new Error(
        `Invalid migration list: entry #${index} has version ${migration.version}, expected ${expected}. ` +
          "Migrations must be a gap-free, strictly-increasing list starting at 1.",
      )
    }
  })

  const current = getUserVersion(db)
  if (current > LATEST_VERSION) {
    throw new Error(
      `Database schema version (${current}) is newer than this app supports (${LATEST_VERSION}). ` +
        "This usually means the database was written by a newer build; refusing to start to avoid corruption.",
    )
  }

  const pending = MIGRATIONS.filter((m) => m.version > current)
  if (pending.length === 0) return

  logger.info({ from: current, to: LATEST_VERSION, count: pending.length }, "applying sqlite migrations")

  for (const migration of pending) {
    db.exec("BEGIN")
    try {
      migration.up(db)
      // user_version only accepts an integer literal, not a bound parameter.
      // `version` is validated above to be a safe integer.
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec("COMMIT")
      logger.info({ version: migration.version, name: migration.name }, "applied sqlite migration")
    } catch (error) {
      // The failing statement may have already aborted the transaction, in
      // which case ROLLBACK itself throws "no transaction is active". Swallow
      // that secondary error so the ORIGINAL migration error is what propagates.
      try {
        db.exec("ROLLBACK")
      } catch (rollbackError) {
        logger.warn(
          { version: migration.version, name: migration.name, err: rollbackError },
          "sqlite migration rollback failed (transaction likely already aborted)",
        )
      }
      logger.error(
        { version: migration.version, name: migration.name, err: error },
        "sqlite migration failed; rolled back",
      )
      throw error
    }
  }
}
