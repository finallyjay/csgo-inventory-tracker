import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { recordInventoryValue, getInventoryValueHistory, getLatestInventoryValue } from "@/lib/server/inventory-value"
import { getSqliteDatabase } from "@/lib/server/sqlite"

// sqlite.ts reads process.env.SQLITE_PATH lazily on the first getSqliteDatabase()
// call (not at import time), so setting it in beforeAll — before any helper runs
// — points the singleton at a throwaway file. No Steam env vars are needed.
const dbPath = join(tmpdir(), `csgo-inv-value-test-${process.pid}.sqlite`)
const STEAM_ID = "76561197960287930"

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
  const db = getSqliteDatabase()
  const now = new Date().toISOString()
  // inventory_value_history has a FK to steam_profile, so seed a profile row.
  db.prepare(
    `INSERT INTO steam_profile (steam_id, created_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(steam_id) DO NOTHING`,
  ).run(STEAM_ID, now, now)
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true })
  }
})

describe("inventory value history", () => {
  it("records and reads back a snapshot", () => {
    recordInventoryValue(STEAM_ID, {
      snapshotDate: "2026-06-01",
      currency: "USD",
      totalValue: 12345,
      itemCount: 40,
      pricedItemCount: 38,
    })

    const history = getInventoryValueHistory(STEAM_ID, { from: "2026-06-01", to: "2026-06-01" })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      snapshotDate: "2026-06-01",
      currency: "USD",
      totalValue: 12345,
      itemCount: 40,
      pricedItemCount: 38,
    })
    expect(history[0].computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("is idempotent per day — re-running overwrites the same row", () => {
    recordInventoryValue(STEAM_ID, { snapshotDate: "2026-06-02", totalValue: 100 })
    recordInventoryValue(STEAM_ID, { snapshotDate: "2026-06-02", totalValue: 250 })

    const history = getInventoryValueHistory(STEAM_ID, { from: "2026-06-02", to: "2026-06-02" })
    expect(history).toHaveLength(1)
    expect(history[0].totalValue).toBe(250)
  })

  it("rounds fractional minor units to integers", () => {
    recordInventoryValue(STEAM_ID, { snapshotDate: "2026-06-03", totalValue: 99.6 })
    const [snap] = getInventoryValueHistory(STEAM_ID, { from: "2026-06-03", to: "2026-06-03" })
    expect(snap.totalValue).toBe(100)
  })

  it("returns history oldest-first and honors limit (keeping the most recent)", () => {
    const all = getInventoryValueHistory(STEAM_ID)
    const dates = all.map((s) => s.snapshotDate)
    expect(dates).toEqual([...dates].sort())

    const limited = getInventoryValueHistory(STEAM_ID, { limit: 2 })
    expect(limited).toHaveLength(2)
    // Most recent two, still chronological
    expect(limited[1].snapshotDate).toBe(dates[dates.length - 1])
  })

  it("exposes the latest snapshot", () => {
    const latest = getLatestInventoryValue(STEAM_ID)
    expect(latest?.snapshotDate).toBe("2026-06-03")
  })

  it("returns null latest for an unknown user", () => {
    expect(getLatestInventoryValue("00000000000000000")).toBeNull()
  })
})
