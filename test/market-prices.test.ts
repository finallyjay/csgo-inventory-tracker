import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { setCachedPrice, getCachedPrices, getPrices } from "@/lib/server/market-prices"

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

/** Builds a fake Response for the priceoverview endpoint. */
function priceResponse(price: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, lowest_price: price }),
  }
}

/** Builds a fake 429 rate-limit Response, optionally with a Retry-After. */
function rateLimitResponse(retryAfter?: string) {
  return {
    ok: false,
    status: 429,
    headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null) },
    json: async () => ({}),
  }
}

describe("getPrices 429 handling", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("aborts remaining live fetches on a 429 without Retry-After, skipping the rest", async () => {
    // Currency is unique per test to avoid the shared cache leaking between runs.
    const currency = "T429A"
    const names = ["A | one", "B | two", "C | three"]

    const fetchMock = vi.fn().mockResolvedValue(rateLimitResponse())
    vi.stubGlobal("fetch", fetchMock)

    const result = await getPrices(names, currency, { delayMs: 0 })

    // First name triggers the 429 and aborts; the other two are never fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.rateLimited).toBe(true)
    expect(result.fetched).toBe(0)
    expect(result.skipped).toEqual(names)
    // The rate-limited name was not cached as a bogus null.
    expect(getCachedPrices([names[0]], currency).has(names[0])).toBe(false)
  })

  it("honours Retry-After and retries the same name once, then continues", async () => {
    const currency = "T429B"
    const names = ["A | one", "B | two"]

    const fetchMock = vi
      .fn()
      // First name: 429 with Retry-After 0 → back off then retry → success.
      .mockResolvedValueOnce(rateLimitResponse("0"))
      .mockResolvedValueOnce(priceResponse("$1.00"))
      // Second name: succeeds outright.
      .mockResolvedValueOnce(priceResponse("$2.00"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await getPrices(names, currency, { delayMs: 0 })

    // 3 calls: retry on name A, plus name B.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.rateLimited).toBe(false)
    expect(result.fetched).toBe(2)
    expect(result.skipped).toEqual([])
    expect(result.prices.get(names[0])).toBe(100)
    expect(result.prices.get(names[1])).toBe(200)
  })

  it("aborts if the post-backoff retry also 429s", async () => {
    const currency = "T429C"
    const names = ["A | one", "B | two"]

    const fetchMock = vi
      .fn()
      // Name A: 429 with Retry-After, then 429 again on retry → abort.
      .mockResolvedValueOnce(rateLimitResponse("0"))
      .mockResolvedValueOnce(rateLimitResponse("0"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await getPrices(names, currency, { delayMs: 0 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.rateLimited).toBe(true)
    expect(result.fetched).toBe(0)
    expect(result.skipped).toEqual(names)
  })

  it("still serves cached names after a rate-limit abort", async () => {
    const currency = "T429D"
    const cachedName = "Cached | item"
    setCachedPrice(cachedName, currency, 555)
    const names = ["Fetch | me", cachedName]

    const fetchMock = vi.fn().mockResolvedValue(rateLimitResponse())
    vi.stubGlobal("fetch", fetchMock)

    const result = await getPrices(names, currency, { delayMs: 0 })

    expect(result.rateLimited).toBe(true)
    expect(result.prices.get(cachedName)).toBe(555)
    expect(result.cacheHits).toBe(1)
    expect(result.skipped).toEqual(["Fetch | me"])
  })
})
