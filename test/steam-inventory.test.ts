import { describe, it, expect } from "vitest"
import {
  parseInventory,
  parseInventoryItems,
  parseStickers,
  inventoryErrorInfo,
  type RawInventoryResponse,
} from "@/lib/server/steam-inventory"

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
    expect(parseInventory({})).toEqual({ items: [], totalItemCount: 0 })
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
