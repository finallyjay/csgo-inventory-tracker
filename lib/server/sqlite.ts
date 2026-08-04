import "server-only"

import { accessSync, constants, mkdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { dirname, join } from "node:path"

import { runMigrations } from "@/lib/server/migrations"

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
 * Applies the connection-level pragmas that must be set on every fresh
 * connection. These are deliberately kept out of the migration system:
 * `journal_mode`/`synchronous` are per-database persistent settings that we
 * (re)assert on connect, `foreign_keys` is per-connection, and none of them can
 * run inside a transaction — which every migration does.
 */
function applyConnectionPragmas(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `)
}

/**
 * Returns the shared SQLite connection.
 *
 * On first use it opens the file, applies connection pragmas, and brings the
 * schema up to date by running any pending versioned migrations (see
 * `lib/server/migrations.ts`). The initial migration (v1) is the schema the app
 * shipped with and uses `CREATE TABLE IF NOT EXISTS`, so pre-existing databases
 * (which have the tables but `user_version = 0`) are stamped up to v1 without
 * touching any data.
 */
export function getSqliteDatabase(): DatabaseSync {
  if (database) return database

  const dbPath = getDatabasePath()
  mkdirSync(dirname(dbPath), { recursive: true })

  database = new DatabaseSync(dbPath)
  applyConnectionPragmas(database)
  runMigrations(database)

  return database
}
