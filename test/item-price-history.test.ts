import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { recordItemPrice, getItemPriceHistory } from "@/lib/server/item-price-history"
import { upsertItemMeta, getItemMeta } from "@/lib/server/item-meta"

const dbPath = join(tmpdir(), `csgo-item-history-test-${process.pid}.sqlite`)
const NAME = "AK-47 | Redline (Field-Tested)"

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

describe("item price history", () => {
  it("records points and reads them oldest-first", () => {
    recordItemPrice(NAME, "USD", 1000, "2026-06-01")
    recordItemPrice(NAME, "USD", 1100, "2026-06-02")
    recordItemPrice(NAME, "USD", 1050, "2026-06-03")

    const history = getItemPriceHistory(NAME, "USD")
    expect(history.map((p) => p.snapshotDate)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"])
    expect(history.map((p) => p.price)).toEqual([1000, 1100, 1050])
  })

  it("is idempotent per day — the same date overwrites", () => {
    recordItemPrice(NAME, "USD", 2000, "2026-06-04")
    recordItemPrice(NAME, "USD", 2200, "2026-06-04")
    const history = getItemPriceHistory(NAME, "USD", { from: "2026-06-04", to: "2026-06-04" })
    expect(history).toHaveLength(1)
    expect(history[0].price).toBe(2200)
  })

  it("isolates currencies", () => {
    recordItemPrice(NAME, "EUR", 950, "2026-06-01")
    const usd = getItemPriceHistory(NAME, "USD", { from: "2026-06-01", to: "2026-06-01" })
    const eur = getItemPriceHistory(NAME, "EUR", { from: "2026-06-01", to: "2026-06-01" })
    expect(usd[0].price).toBe(1000)
    expect(eur[0].price).toBe(950)
  })

  it("honors limit, keeping the most recent points (chronological)", () => {
    const limited = getItemPriceHistory(NAME, "USD", { limit: 2 })
    expect(limited.map((p) => p.snapshotDate)).toEqual(["2026-06-03", "2026-06-04"])
  })

  it("returns empty for an unknown item", () => {
    expect(getItemPriceHistory("Nonexistent | Item", "USD")).toEqual([])
  })
})

describe("item metadata", () => {
  it("upserts and reads back metadata", () => {
    upsertItemMeta([
      {
        marketHashName: NAME,
        name: "AK-47 | Redline",
        iconUrl: "https://cdn/icon",
        rarity: "Classified",
        rarityColor: "d32ce6",
        type: "Rifle",
        exterior: "Field-Tested",
      },
    ])

    const meta = getItemMeta(NAME)
    expect(meta).toMatchObject({
      marketHashName: NAME,
      name: "AK-47 | Redline",
      iconUrl: "https://cdn/icon",
      rarity: "Classified",
      type: "Rifle",
    })
  })

  it("COALESCE keeps existing values when a later upsert sends nulls", () => {
    upsertItemMeta([
      {
        marketHashName: NAME,
        name: "AK-47 | Redline",
        iconUrl: null,
        rarity: null,
        rarityColor: null,
        type: null,
        exterior: null,
      },
    ])
    const meta = getItemMeta(NAME)
    expect(meta?.iconUrl).toBe("https://cdn/icon") // preserved
    expect(meta?.type).toBe("Rifle")
  })

  it("returns null for an unknown item and is a no-op for empty input", () => {
    expect(getItemMeta("Unknown | Thing")).toBeNull()
    expect(() => upsertItemMeta([])).not.toThrow()
  })
})
