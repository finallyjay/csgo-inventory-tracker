import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { recordHoldings, getHoldings, getHoldingDates, getLatestStickersForItem } from "@/lib/server/inventory-holdings"

const dbPath = join(tmpdir(), `csgo-holdings-test-${process.pid}.sqlite`)
const SID = "76561197960287930"

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

describe("inventory holdings", () => {
  it("records a day's holdings and reads them back, value-sorted", () => {
    recordHoldings(SID, {
      snapshotDate: "2026-06-09",
      currency: "EUR",
      items: [
        { marketHashName: "AK-47 | Redline (Field-Tested)", count: 2, unitPrice: 1000 },
        { marketHashName: "★ Karambit | Doppler (FN)", count: 1, unitPrice: 50000 },
        { marketHashName: "Sticker | Foo", count: 1, unitPrice: null },
      ],
    })

    const { snapshotDate, items } = getHoldings(SID, "2026-06-09")
    expect(snapshotDate).toBe("2026-06-09")
    // Karambit (50000) before AK line total (2000) before unpriced sticker.
    expect(items.map((i) => i.marketHashName)).toEqual([
      "★ Karambit | Doppler (FN)",
      "AK-47 | Redline (Field-Tested)",
      "Sticker | Foo",
    ])
    expect(items[1].lineTotal).toBe(2000)
    expect(items[2].lineTotal).toBeNull()
  })

  it("is idempotent per day — a re-sync replaces the day's rows", () => {
    recordHoldings(SID, {
      snapshotDate: "2026-06-09",
      currency: "EUR",
      items: [{ marketHashName: "Only | One", count: 1, unitPrice: 500 }],
    })
    const { items } = getHoldings(SID, "2026-06-09")
    expect(items).toHaveLength(1)
    expect(items[0].marketHashName).toBe("Only | One")
  })

  it("defaults to the most recent snapshot and lists available dates", () => {
    recordHoldings(SID, {
      snapshotDate: "2026-06-10",
      currency: "EUR",
      items: [{ marketHashName: "Newer | Day", count: 1, unitPrice: 100 }],
    })

    const latest = getHoldings(SID)
    expect(latest.snapshotDate).toBe("2026-06-10")
    expect(getHoldingDates(SID)).toEqual(["2026-06-10", "2026-06-09"])
  })

  it("returns an empty snapshot for an unknown user", () => {
    expect(getHoldings("00000000000000000")).toEqual({ snapshotDate: null, items: [] })
  })

  it("stores stickers per day + per item and reads them back", () => {
    const stickers = [
      { name: "olofmeister | Krakow 2017", image: "https://cdn/a.png" },
      { name: "Astralis | Krakow 2017", image: "https://cdn/b.png" },
    ]
    recordHoldings(SID, {
      snapshotDate: "2026-06-11",
      currency: "EUR",
      items: [
        { marketHashName: "AWP | Asiimov (Well-Worn)", count: 1, unitPrice: 5000, stickers },
        { marketHashName: "Kilowatt Case", count: 3, unitPrice: 20 }, // no stickers
      ],
    })

    const { items } = getHoldings(SID, "2026-06-11")
    const awp = items.find((i) => i.marketHashName.startsWith("AWP"))!
    const cs = items.find((i) => i.marketHashName === "Kilowatt Case")!
    expect(awp.stickers.map((s) => s.name)).toEqual(["olofmeister | Krakow 2017", "Astralis | Krakow 2017"])
    expect(cs.stickers).toEqual([])
  })

  it("getLatestStickersForItem returns stickers from the most recent snapshot", () => {
    recordHoldings(SID, {
      snapshotDate: "2026-06-12",
      currency: "EUR",
      // Same weapon, but the sticker was scraped off — no stickers this day.
      items: [{ marketHashName: "AWP | Asiimov (Well-Worn)", count: 1, unitPrice: 5200 }],
    })
    // Latest snapshot (06-12) has none, even though 06-11 had two.
    expect(getLatestStickersForItem(SID, "AWP | Asiimov (Well-Worn)")).toEqual([])
  })
})
