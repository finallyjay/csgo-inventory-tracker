import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import {
  parseInventory,
  parseInventoryItems,
  parseStickers,
  inventoryErrorInfo,
  fetchWithBackoff,
  fetchInventory,
  fetchInventoryItems,
  MAX_INVENTORY_PAGES,
  type RawInventoryResponse,
} from "@/lib/server/steam-inventory"
import { getSqliteDatabase } from "@/lib/server/sqlite"
import { logger } from "@/lib/server/logger"

const RAW: RawInventoryResponse = {
  success: 1,
  total_inventory_count: 4,
  assets: [
    { classid: "1", instanceid: "0", amount: "1" }, // AK marketable
    { classid: "1", instanceid: "0", amount: "1" }, // another AK (same name)
    { classid: "2", instanceid: "0", amount: "1" }, // knife marketable
    { classid: "9", instanceid: "0", amount: "1" }, // untradable graffiti (not marketable)
  ],
  descriptions: [
    { classid: "1", instanceid: "0", market_hash_name: "AK-47 | Redline (Field-Tested)", marketable: 1 },
    { classid: "2", instanceid: "0", market_hash_name: "★ Karambit | Doppler (Factory New)", marketable: 1 },
    { classid: "9", instanceid: "0", market_hash_name: "Sealed Graffiti | Wow", marketable: 0 },
  ],
}

describe("parseInventory", () => {
  it("aggregates marketable items by name and sums counts", () => {
    const { items } = parseInventory(RAW)
    const ak = items.find((i) => i.marketHashName.startsWith("AK-47"))
    expect(ak?.count).toBe(2)
    expect(items).toHaveLength(2) // AK + Karambit; graffiti excluded
  })

  it("excludes non-marketable items", () => {
    const { items } = parseInventory(RAW)
    expect(items.some((i) => i.marketHashName.includes("Graffiti"))).toBe(false)
  })

  it("counts every asset (marketable or not) in totalItemCount", () => {
    const { totalItemCount } = parseInventory(RAW)
    expect(totalItemCount).toBe(4)
  })

  it("handles an empty / malformed payload", () => {
    expect(parseInventory({})).toEqual({ items: [], totalItemCount: 0, truncated: false })
  })
})

const RICH: RawInventoryResponse = {
  success: 1,
  assets: [
    { classid: "1", instanceid: "0", amount: "1" },
    { classid: "1", instanceid: "0", amount: "1" },
    { classid: "9", instanceid: "0", amount: "1" }, // non-marketable graffiti
  ],
  descriptions: [
    {
      classid: "1",
      instanceid: "0",
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      name: "AK-47 | Redline",
      icon_url: "abc123",
      marketable: 1,
      tradable: 1,
      tags: [
        { category: "Rarity", localized_tag_name: "Classified", color: "d32ce6" },
        { category: "Type", localized_tag_name: "Rifle" },
        { category: "Exterior", localized_tag_name: "Field-Tested" },
      ],
    },
    {
      classid: "9",
      instanceid: "0",
      market_hash_name: "Sealed Graffiti | Wow",
      name: "Sealed Graffiti | Wow",
      marketable: 0,
      tradable: 0,
    },
  ],
}

describe("parseInventoryItems (detailed)", () => {
  it("keeps both marketable and non-marketable items", () => {
    const { items } = parseInventoryItems(RICH)
    expect(items).toHaveLength(2)
    expect(items.some((i) => !i.marketable)).toBe(true)
  })

  it("aggregates duplicates and builds an absolute icon URL", () => {
    const ak = parseInventoryItems(RICH).items.find((i) => i.name.startsWith("AK-47"))!
    expect(ak.count).toBe(2)
    expect(ak.iconUrl).toBe("https://community.fastly.steamstatic.com/economy/image/abc123")
  })

  it("extracts rarity, type and exterior from tags", () => {
    const ak = parseInventoryItems(RICH).items.find((i) => i.name.startsWith("AK-47"))!
    expect(ak.rarity).toBe("Classified")
    expect(ak.rarityColor).toBe("d32ce6")
    expect(ak.type).toBe("Rifle")
    expect(ak.exterior).toBe("Field-Tested")
  })

  it("leaves iconUrl null when Steam gives no icon", () => {
    const graffiti = parseInventoryItems(RICH).items.find((i) => i.name.includes("Graffiti"))!
    expect(graffiti.iconUrl).toBeNull()
  })

  it("surfaces Steam's total_inventory_count as steamReportedCount", () => {
    const parsed = parseInventoryItems(RAW)
    expect(parsed.totalItemCount).toBe(4)
    expect(parsed.steamReportedCount).toBe(4)
  })

  it("flags a discrepancy when Steam reports more than it serves (e.g. recent Market buys)", () => {
    // Steam counts 6 but only ships 4 assets — the 2-item gap the UI surfaces.
    const parsed = parseInventoryItems({ ...RAW, total_inventory_count: 6 })
    expect(parsed.totalItemCount).toBe(4)
    expect(parsed.steamReportedCount).toBe(6)
    expect(parsed.steamReportedCount - parsed.totalItemCount).toBe(2)
  })

  it("falls back to the received count when Steam omits total_inventory_count", () => {
    const parsed = parseInventoryItems(RICH) // no total_inventory_count
    expect(parsed.steamReportedCount).toBe(parsed.totalItemCount)
  })

  it("defaults truncated to false when the raw payload doesn't set it", () => {
    expect(parseInventoryItems(RAW).truncated).toBe(false)
    expect(parseInventory(RAW).truncated).toBe(false)
  })

  it("propagates raw.truncated through both parseInventoryItems and parseInventory", () => {
    const truncatedRaw = { ...RAW, truncated: true }
    expect(parseInventoryItems(truncatedRaw).truncated).toBe(true)
    expect(parseInventory(truncatedRaw).truncated).toBe(true)
  })
})

const STICKER_HTML =
  '<br><div class="sticker_info"><center>' +
  '<img width=64 height=48 src="https://cdn.steamstatic.com/a/sig_olof.png" title="Sticker: olofmeister | Krakow 2017">' +
  '<img width=64 height=48 src="https://cdn.steamstatic.com/b/vp.png" title="Sticker: Virtus.Pro | Krakow 2017">' +
  "<br>Sticker: olofmeister | Krakow 2017, Virtus.Pro | Krakow 2017</center></div>"

describe("parseStickers", () => {
  it("extracts sticker names (stripping the 'Sticker:' prefix) and images", () => {
    const stickers = parseStickers([{ value: STICKER_HTML }])
    expect(stickers).toEqual([
      { name: "olofmeister | Krakow 2017", image: "https://cdn.steamstatic.com/a/sig_olof.png" },
      { name: "Virtus.Pro | Krakow 2017", image: "https://cdn.steamstatic.com/b/vp.png" },
    ])
  })

  it("returns [] when there is no sticker_info block", () => {
    expect(parseStickers([{ value: "<br>Exterior: Field-Tested" }])).toEqual([])
    expect(parseStickers(undefined)).toEqual([])
  })
})

describe("parseInventoryItems stickers", () => {
  const raw: RawInventoryResponse = {
    success: 1,
    assets: [
      { classid: "1", instanceid: "10", amount: "1" }, // AWP with stickers A
      { classid: "1", instanceid: "11", amount: "1" }, // same AWP name, NO stickers
    ],
    descriptions: [
      {
        classid: "1",
        instanceid: "10",
        market_hash_name: "AWP | Asiimov (Field-Tested)",
        marketable: 1,
        descriptions: [{ value: STICKER_HTML }],
      },
      {
        classid: "1",
        instanceid: "11",
        market_hash_name: "AWP | Asiimov (Field-Tested)",
        marketable: 1,
      },
    ],
  }

  it("attaches parsed stickers and splits sticker variants into separate rows", () => {
    const { items } = parseInventoryItems(raw)
    // Same name, but different sticker sets → two distinct rows.
    expect(items).toHaveLength(2)
    const withStickers = items.find((i) => i.stickers.length > 0)!
    const without = items.find((i) => i.stickers.length === 0)!
    expect(withStickers.stickers.map((s) => s.name)).toEqual(["olofmeister | Krakow 2017", "Virtus.Pro | Krakow 2017"])
    expect(without.count).toBe(1)
  })
})

describe("fetchWithBackoff", () => {
  const url = new URL("https://steamcommunity.com/inventory/765/730/2")

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetchSequence(statuses: number[]) {
    const mock = vi.fn()
    for (const status of statuses) {
      mock.mockResolvedValueOnce(new Response("{}", { status }))
    }
    vi.stubGlobal("fetch", mock)
    return mock
  }

  it("returns the first response when it is OK", async () => {
    const mock = stubFetchSequence([200])
    const res = await fetchWithBackoff(url, [0, 0])
    expect(res.status).toBe(200)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it("retries a 429 and returns the eventual success", async () => {
    const mock = stubFetchSequence([429, 200])
    const res = await fetchWithBackoff(url, [0, 0])
    expect(res.status).toBe(200)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it("retries a transient 5xx", async () => {
    const mock = stubFetchSequence([503, 200])
    const res = await fetchWithBackoff(url, [0, 0])
    expect(res.status).toBe(200)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it("returns the last 429 once retries are exhausted", async () => {
    const mock = stubFetchSequence([429, 429, 429])
    const res = await fetchWithBackoff(url, [0, 0])
    expect(res.status).toBe(429)
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it("waits out an HTTP-date Retry-After before retrying", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-08-12T12:00:00Z"))
      const mock = vi.fn()
      mock.mockResolvedValueOnce(
        new Response("{}", { status: 429, headers: { "Retry-After": "Wed, 12 Aug 2026 12:00:02 GMT" } }),
      )
      mock.mockResolvedValueOnce(new Response("{}", { status: 200 }))
      vi.stubGlobal("fetch", mock)

      const promise = fetchWithBackoff(url, [0])

      // 1ms short of the 2s the header asks for: the retry must not have fired.
      await vi.advanceTimersByTimeAsync(1999)
      expect(mock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      const res = await promise
      expect(res.status).toBe(200)
      expect(mock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not retry a private-inventory 403", async () => {
    const mock = stubFetchSequence([403])
    const res = await fetchWithBackoff(url, [0, 0])
    expect(res.status).toBe(403)
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe("fetchInventoryRaw in-flight dedup (via fetchInventory / fetchInventoryItems)", () => {
  const dbPath = join(tmpdir(), `csgo-inventory-dedup-test-${process.pid}.sqlite`)

  const ONE_PAGE: RawInventoryResponse = {
    success: 1,
    total_inventory_count: 1,
    assets: [{ classid: "1", instanceid: "0", amount: "1" }],
    descriptions: [
      { classid: "1", instanceid: "0", market_hash_name: "AK-47 | Redline (Field-Tested)", marketable: 1 },
    ],
  }

  beforeAll(() => {
    process.env.SQLITE_PATH = dbPath
  })

  afterAll(() => {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function clearCache(steamId: string) {
    getSqliteDatabase().prepare("DELETE FROM inventory_raw_cache WHERE steam_id = ?").run(steamId)
  }

  it("shares a single underlying fetch between two concurrent cache-miss requests for the same steamId", async () => {
    const steamId = "76561198000000101"
    clearCache(steamId)

    const mock = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          // A small delay so both concurrent calls are guaranteed to observe the
          // cache miss before either finishes — reproducing the stampede window.
          setTimeout(() => resolve(new Response(JSON.stringify(ONE_PAGE), { status: 200 })), 20),
        ),
    )
    vi.stubGlobal("fetch", mock)

    const [a, b] = await Promise.all([fetchInventory(steamId), fetchInventoryItems(steamId)])

    expect(mock).toHaveBeenCalledTimes(1)
    expect(a.items).toHaveLength(1)
    expect(b.items).toHaveLength(1)
  })

  it("dedupes concurrent requests keyed per steamId (a different steamId still fetches independently)", async () => {
    const steamIdA = "76561198000000102"
    const steamIdB = "76561198000000103"
    clearCache(steamIdA)
    clearCache(steamIdB)

    const mock = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify(ONE_PAGE), { status: 200 })), 20),
        ),
    )
    vi.stubGlobal("fetch", mock)

    await Promise.all([
      fetchInventory(steamIdA),
      fetchInventory(steamIdA),
      fetchInventory(steamIdB),
      fetchInventory(steamIdB),
    ])

    // One underlying fetch per distinct steamId, not one overall.
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it("does not cache a rejected in-flight promise: a later call retries after a failure", async () => {
    const steamId = "76561198000000104"
    clearCache(steamId)

    // First attempt: a private inventory (403) — fetchWithBackoff does not
    // retry this status, so it fails fast without waiting out real timers.
    const failing = vi.fn(() => Promise.resolve(new Response("null", { status: 403 })))
    vi.stubGlobal("fetch", failing)

    await expect(fetchInventory(steamId)).rejects.toThrow()
    expect(failing).toHaveBeenCalledTimes(1)

    // Second attempt succeeds. If the failed in-flight promise had stuck
    // around in the dedup map, this call would incorrectly reuse (and thus
    // reject from) it instead of trying again.
    const succeeding = vi.fn(() => Promise.resolve(new Response(JSON.stringify(ONE_PAGE), { status: 200 })))
    vi.stubGlobal("fetch", succeeding)

    const result = await fetchInventory(steamId)
    expect(succeeding).toHaveBeenCalledTimes(1)
    expect(result.items).toHaveLength(1)
  })
})

describe("inventory pagination truncation (via fetchInventoryItems)", () => {
  const dbPath = join(tmpdir(), `csgo-inventory-truncation-test-${process.pid}.sqlite`)

  beforeAll(() => {
    process.env.SQLITE_PATH = dbPath
  })

  afterAll(() => {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function clearCache(steamId: string) {
    getSqliteDatabase().prepare("DELETE FROM inventory_raw_cache WHERE steam_id = ?").run(steamId)
  }

  /** A page that always claims more items remain, so pagination never stops on its own. */
  function openEndedPage(page: number): RawInventoryResponse {
    return {
      success: 1,
      assets: [{ classid: "1", instanceid: "0", amount: "1" }],
      descriptions: [
        { classid: "1", instanceid: "0", market_hash_name: "AK-47 | Redline (Field-Tested)", marketable: 1 },
      ],
      more_items: 1,
      last_assetid: `asset-${page}`,
    }
  }

  it("warns and flags the result truncated when more_items is still set after MAX_INVENTORY_PAGES", async () => {
    const steamId = "76561198000000201"
    clearCache(steamId)

    const mock = vi.fn()
    for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
      mock.mockResolvedValueOnce(new Response(JSON.stringify(openEndedPage(page)), { status: 200 }))
    }
    vi.stubGlobal("fetch", mock)
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger)

    const detailed = await fetchInventoryItems(steamId)

    // Stops exactly at the page cap, never asking Steam for an 11th page.
    expect(mock).toHaveBeenCalledTimes(MAX_INVENTORY_PAGES)
    expect(detailed.truncated).toBe(true)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [meta, message] = warnSpy.mock.calls[0]
    expect(meta).toMatchObject({ steamId, pages: MAX_INVENTORY_PAGES })
    expect(message).toMatch(/truncat/i)
  })

  it("does not warn or flag truncated when the last page reports no more items", async () => {
    const steamId = "76561198000000202"
    clearCache(steamId)

    const finalPage: RawInventoryResponse = { ...openEndedPage(0), more_items: undefined, last_assetid: undefined }
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(finalPage), { status: 200 }))
    vi.stubGlobal("fetch", mock)
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger)

    const detailed = await fetchInventoryItems(steamId)

    expect(mock).toHaveBeenCalledTimes(1)
    expect(detailed.truncated).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe("inventoryErrorInfo", () => {
  it("treats 400 and 403 as a private inventory (not rate limiting)", () => {
    for (const status of [400, 403]) {
      const info = inventoryErrorInfo(status)
      expect(info.status).toBe(403)
      expect(info.message).toMatch(/Public/)
      expect(info.message).not.toMatch(/rate-limit/i)
    }
  })

  it("treats 429 as a rate limit", () => {
    const info = inventoryErrorInfo(429)
    expect(info.status).toBe(429)
    expect(info.message).toMatch(/rate-limit/i)
  })

  it("falls back to 502 for unexpected statuses", () => {
    expect(inventoryErrorInfo(500).status).toBe(502)
  })
})
