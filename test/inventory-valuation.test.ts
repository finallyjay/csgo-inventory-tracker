import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { computeInventoryValue } from "@/lib/server/inventory-valuation"
import { getLatestInventoryValue } from "@/lib/server/inventory-value"
import { getSqliteDatabase } from "@/lib/server/sqlite"

const dbPath = join(tmpdir(), `csgo-valuation-test-${process.pid}.sqlite`)
const STEAM_ID = "76561197960287930"

const INVENTORY = {
  success: 1,
  assets: [
    { classid: "1", instanceid: "0", amount: "1" },
    { classid: "1", instanceid: "0", amount: "1" },
    { classid: "2", instanceid: "0", amount: "1" },
  ],
  descriptions: [
    { classid: "1", instanceid: "0", market_hash_name: "AK-47 | Redline (Field-Tested)", marketable: 1 },
    { classid: "2", instanceid: "0", market_hash_name: "★ Karambit | Doppler (Factory New)", marketable: 1 },
  ],
}

const PRICES: Record<string, string> = {
  "AK-47 | Redline (Field-Tested)": "$10.00",
  "★ Karambit | Doppler (Factory New)": "$1,000.00",
}

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
  const db = getSqliteDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO steam_profile (steam_id, created_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(steam_id) DO NOTHING`,
  ).run(STEAM_ID, now, now)
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
  vi.unstubAllGlobals()
})

beforeEach(() => {
  // Fresh price cache each test so the live-fetch path is exercised.
  getSqliteDatabase().prepare("DELETE FROM market_price_cache").run()

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes("/inventory/")) {
        return { ok: true, json: async () => INVENTORY } as unknown as Response
      }
      if (url.includes("/market/priceoverview/")) {
        const name = new URL(url).searchParams.get("market_hash_name") ?? ""
        const price = PRICES[name]
        return { ok: true, json: async () => ({ success: true, lowest_price: price }) } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
})

describe("computeInventoryValue", () => {
  it("values the inventory and records a snapshot", async () => {
    const result = await computeInventoryValue(STEAM_ID, { currency: "USD", delayMs: 0, snapshotDate: "2026-06-05" })

    // AK $10 x2 (2000) + Karambit $1000 x1 (100000) = 102000 cents
    expect(result.totalValue).toBe(102000)
    expect(result.itemCount).toBe(3)
    expect(result.pricedItemCount).toBe(3)
    expect(result.unpricedNames).toBe(0)

    const snap = getLatestInventoryValue(STEAM_ID)
    expect(snap?.snapshotDate).toBe("2026-06-05")
    expect(snap?.totalValue).toBe(102000)
  })

  it("counts items with no price under unpricedNames and excludes them from the total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes("/inventory/")) return { ok: true, json: async () => INVENTORY } as unknown as Response
        // Steam reports no price for everything.
        return { ok: true, json: async () => ({ success: false }) } as unknown as Response
      }),
    )

    const result = await computeInventoryValue(STEAM_ID, {
      currency: "USD",
      delayMs: 0,
      persist: false,
    })

    expect(result.totalValue).toBe(0)
    expect(result.unpricedNames).toBe(2)
    expect(result.pricedItemCount).toBe(0)
  })

  it("serves repeat names from the shared cache (one live fetch per unique name)", async () => {
    const spy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await computeInventoryValue(STEAM_ID, { currency: "USD", delayMs: 0, persist: false })

    // 1 inventory call + 2 unique price calls = 3 (the duplicate AK is deduped).
    expect(spy.mock.calls.length).toBe(3)
  })
})
