import { describe, it, expect } from "vitest"
import { parsePriceToMinorUnits, formatPrice, steamCurrencyCode, steamMarketUrl } from "@/lib/market"

describe("parsePriceToMinorUnits", () => {
  it("parses a simple USD string", () => {
    expect(parsePriceToMinorUnits("$1.23")).toBe(123)
  })

  it("parses thousands grouping (US format)", () => {
    expect(parsePriceToMinorUnits("$1,234.56")).toBe(123456)
  })

  it("parses comma-decimal (EU format)", () => {
    expect(parsePriceToMinorUnits("1,23€")).toBe(123)
  })

  it("parses EU thousands + comma decimal", () => {
    expect(parsePriceToMinorUnits("1.234,56 €")).toBe(123456)
  })

  it("parses a whole-number price with no decimals", () => {
    expect(parsePriceToMinorUnits("$5")).toBe(500)
  })

  it("returns null for empty / missing / non-numeric input", () => {
    expect(parsePriceToMinorUnits("")).toBeNull()
    expect(parsePriceToMinorUnits(null)).toBeNull()
    expect(parsePriceToMinorUnits(undefined)).toBeNull()
    expect(parsePriceToMinorUnits("--")).toBeNull()
  })
})

describe("formatPrice", () => {
  it("formats USD with the symbol before the number", () => {
    expect(formatPrice(12345, "USD")).toBe("$123.45")
  })

  it("formats EUR with the symbol after the number and a comma decimal", () => {
    expect(formatPrice(3750, "EUR")).toBe("37,50€")
    expect(formatPrice(99, "EUR")).toBe("0,99€")
  })

  it("formats GBP with the symbol before the number", () => {
    expect(formatPrice(3237, "GBP")).toBe("£32.37")
  })

  it("falls back gracefully for an unknown currency", () => {
    expect(formatPrice(100, "XYZ")).toBe("1.00")
  })
})

describe("steamMarketUrl", () => {
  it("appends the matching WearCategory filter for each wear", () => {
    expect(steamMarketUrl("AK-47 | Vulcan (Field-Tested)")).toBe(
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Vulcan%20(Field-Tested)?appid=730&category_730_Exterior=tag_WearCategory2",
    )
    expect(steamMarketUrl("★ Karambit | Doppler (Factory New)")).toContain("tag_WearCategory0")
    expect(steamMarketUrl("AWP | Asiimov (Well-Worn)")).toContain("tag_WearCategory3")
    expect(steamMarketUrl("M4A4 | Asiimov (Battle-Scarred)")).toContain("tag_WearCategory4")
  })

  it("omits the wear filter for items without a wear", () => {
    expect(steamMarketUrl("Kilowatt Case")).toBe("https://steamcommunity.com/market/listings/730/Kilowatt%20Case")
    // A non-wear parenthetical (e.g. a sticker variant) is not a WearCategory.
    expect(steamMarketUrl("Sticker | Titan (Holo) | Katowice 2014")).not.toContain("WearCategory")
  })
})

describe("steamCurrencyCode", () => {
  it("maps known currencies", () => {
    expect(steamCurrencyCode("USD")).toBe(1)
    expect(steamCurrencyCode("GBP")).toBe(2)
    expect(steamCurrencyCode("EUR")).toBe(3)
  })

  it("defaults unknown currencies to USD (1)", () => {
    expect(steamCurrencyCode("XYZ")).toBe(1)
  })
})
