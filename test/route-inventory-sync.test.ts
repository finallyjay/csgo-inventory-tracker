import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import type { SteamUser } from "@/lib/auth"

// getCurrentUser() reads from next/headers cookies() + verifySession(), which
// needs a real request context this test doesn't have. Mocking the
// server-auth helper (as other route-level call sites already treat it as
// the auth boundary) keeps the test focused on the route's own contract:
// what it does with an authenticated/unauthenticated user, not how sessions
// are verified (that's covered by test/session.test.ts).
const getCurrentUserMock = vi.fn()

vi.mock("@/app/lib/server-auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

// Stub out valuation entirely for the "past the rate limiter" sanity check
// below, so that test stays about the 429 contract and never touches sqlite
// or the network (which would need SQLITE_PATH / a fetch stub of their own).
const computeInventoryValueMock = vi.fn()

vi.mock("@/lib/server/inventory-valuation", () => ({
  computeInventoryValue: () => computeInventoryValueMock(),
}))

const USER: SteamUser = {
  steamId: "76561197960287930",
  displayName: "Test User",
  avatar: "https://cdn.example.com/avatar.png",
  profileUrl: "https://steamcommunity.com/profiles/76561197960287930",
}

beforeAll(() => {
  // env.STEAM_MARKET_CURRENCY is read (triggering full env validation) once a
  // request gets past auth + rate limiting, so STEAM_API_KEY must be present
  // even though this suite never talks to Steam.
  process.env.STEAM_API_KEY = "test-api-key"
})

beforeEach(() => {
  // Fresh module registry per test: the route pulls in
  // lib/server/rate-limit.ts, whose limiter state lives in a module-scoped
  // Map, so resetting modules gives every test its own untouched budget
  // instead of bleeding state across tests in this file.
  vi.resetModules()
  getCurrentUserMock.mockReset()
  computeInventoryValueMock.mockReset()
})

describe("POST /api/inventory/sync — auth contract", () => {
  it("returns 401 when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { POST } = await import("@/app/api/inventory/sync/route")
    const res = await POST()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })
})

describe("POST /api/inventory/sync — rate limit contract", () => {
  it("returns 429 once the per-user budget (3 per 5 min) is already spent", async () => {
    getCurrentUserMock.mockResolvedValue(USER)

    // Exhaust the limiter through its own public API — the exact same
    // `inv-sync:<steamId>` key and 3-per-5-min window the route applies —
    // instead of reaching into rate-limit's internals. lib/server/rate-limit.ts
    // has a concurrent PR rewriting it, so this test only relies on the
    // public `rateLimit()` contract staying stable.
    const { rateLimit } = await import("@/lib/server/rate-limit")
    const key = `inv-sync:${USER.steamId}`
    const windowMs = 5 * 60_000
    rateLimit(key, 3, windowMs)
    rateLimit(key, 3, windowMs)
    rateLimit(key, 3, windowMs)

    const { POST } = await import("@/app/api/inventory/sync/route")
    const res = await POST()
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: "Too many requests. Try again in a few minutes." })
  })

  it("does not rate-limit a fresh user under the same budget", async () => {
    getCurrentUserMock.mockResolvedValue(USER)
    computeInventoryValueMock.mockResolvedValue({
      currency: "USD",
      totalValue: 0,
      itemCount: 0,
      pricedItemCount: 0,
      unpricedNames: 0,
      truncated: false,
    })

    // Sanity check on the test itself: a user who hasn't touched the
    // limiter yet must not hit 429 (otherwise the 429 assertion above could
    // be a false positive from some other failure mode, e.g. a shared
    // limiter key). computeInventoryValue is mocked at file scope so this
    // never touches sqlite or the network.
    const { POST } = await import("@/app/api/inventory/sync/route")
    const res = await POST()
    expect(res.status).toBe(200)
    expect(computeInventoryValueMock).toHaveBeenCalledTimes(1)
  })
})
