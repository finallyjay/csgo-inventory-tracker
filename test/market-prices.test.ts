import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { setCachedPrice, getCachedPrices } from "@/lib/server/market-prices"

const dbPath = join(tmpdir(), `csgo-prices-test-${process.pid}.sqlite`)

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

describe("getCachedPrices", () => {
  it("returns only cached names for the requested currency, including null prices", () => {
    setCachedPrice("AK-47 | Redline (Field-Tested)", "USD", 1000)
    setCachedPrice("Sticker | Foo", "USD", null) // fetched but no price
    setCachedPrice("AK-47 | Redline (Field-Tested)", "EUR", 950)

    const prices = getCachedPrices(["AK-47 | Redline (Field-Tested)", "Sticker | Foo", "Never | Cached"], "USD")

    expect(prices.get("AK-47 | Redline (Field-Tested)")).toBe(1000)
    expect(prices.get("Sticker | Foo")).toBeNull()
    expect(prices.has("Never | Cached")).toBe(false)
    // EUR row must not leak into a USD query.
    expect(prices.size).toBe(2)
  })

  it("returns an empty map for no names", () => {
    expect(getCachedPrices([], "USD").size).toBe(0)
  })
})
