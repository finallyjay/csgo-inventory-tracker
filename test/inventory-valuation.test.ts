import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { computeInventoryValue } from "@/lib/server/inventory-valuation"
import { getLatestInventoryValue } from "@/lib/server/inventory-value"
import { getItemPriceHistory } from "@/lib/server/item-price-history"
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

  it("records per-item price history under the snapshot day, even when prices come from the warm cache", async () => {
    const AK = "AK-47 | Redline (Field-Tested)"
    getSqliteDatabase().prepare("DELETE FROM item_price_history WHERE market_hash_name = ?").run(AK)

    // First snapshot does a live fetch and warms the price cache.
    await computeInventoryValue(STEAM_ID, { currency: "USD", delayMs: 0, snapshotDate: "2026-06-10" })
    // Next day's snapshot serves entirely from the still-fresh cache — yet the
    // per-item history must still gain a point (the bug: it didn't, so the
    // dashboard line moved while the item chart stayed flat at one entry).
    await computeInventoryValue(STEAM_ID, { currency: "USD", delayMs: 0, snapshotDate: "2026-06-11" })

    const history = getItemPriceHistory(AK, "USD", { from: "2026-06-10", to: "2026-06-11" })
    expect(history).toEqual([
      { snapshotDate: "2026-06-10", price: 1000 },
      { snapshotDate: "2026-06-11", price: 1000 },
    ])
  })

  it("forced-live valuation (maxAgeMs: 0) refetches a warm-cached price, so the value moves", async () => {
    // Day 1: AK at $10, warms the price cache.
    const day1 = await computeInventoryValue(STEAM_ID, { currency: "USD", delayMs: 0, snapshotDate: "2026-06-20" })
    expect(day1.totalValue).toBe(102000)

    // AK doubles to $20 on Steam (cache still holds the $10 from day 1).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes("/inventory/")) return { ok: true, json: async () => INVENTORY } as unknown as Response
        const name = new URL(url).searchParams.get("market_hash_name") ?? ""
        const price = name.startsWith("AK-47") ? "$20.00" : PRICES[name]
        return { ok: true, json: async () => ({ success: true, lowest_price: price }) } as unknown as Response
      }),
    )

    // A forced-live valuation must ignore the warm cache and pick up $20:
    // AK $20 x2 (4000) + Karambit $1000 (100000) = 104000. Without maxAgeMs: 0
    // it would reuse the cached $10 and report an unchanged 102000.
    const live = await computeInventoryValue(STEAM_ID, {
      currency: "USD",
      delayMs: 0,
      snapshotDate: "2026-06-21",
      maxAgeMs: 0,
    })
    expect(live.totalValue).toBe(104000)
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
