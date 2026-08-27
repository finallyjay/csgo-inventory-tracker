import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SteamUser } from "@/lib/auth"

// getCurrentUser() reads from next/headers cookies() + verifySession(), which
// needs a real request context this test doesn't have. Mocking the
// server-auth helper — as the route's own module boundary — keeps this test
// about the route's actual contract (see the docstring fix in
// app/api/auth/me/route.ts: it never throws/401s, it always returns 200 with
// `{ user }`, null or not) rather than session verification, which is
// covered by test/session.test.ts.
const getCurrentUserMock = vi.fn()

vi.mock("@/app/lib/server-auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

const USER: SteamUser = {
  steamId: "76561197960287930",
  displayName: "Test User",
  avatar: "https://cdn.example.com/avatar.png",
  profileUrl: "https://steamcommunity.com/profiles/76561197960287930",
}

beforeEach(() => {
  vi.resetModules()
  getCurrentUserMock.mockReset()
})

describe("GET /api/auth/me — always 200, never 401", () => {
  it("returns 200 with user: null when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { GET } = await import("@/app/api/auth/me/route")
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: null })
  })

  it("returns 200 with the user when a session exists", async () => {
    getCurrentUserMock.mockResolvedValue(USER)
    const { GET } = await import("@/app/api/auth/me/route")
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: USER })
  })
})
