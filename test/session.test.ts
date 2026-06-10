import { describe, it, expect, beforeAll } from "vitest"
import { signSession, verifySession } from "@/lib/server/session"
import type { SteamUser } from "@/lib/auth"

const USER: SteamUser = {
  steamId: "76561198023709299",
  displayName: "Jay",
  avatar: "https://cdn/a.png",
  profileUrl: "https://steamcommunity.com/id/jay",
  timecreated: 1234567890,
}

beforeAll(() => {
  // session.ts signs with SESSION_SECRET (or STEAM_API_KEY); env validation
  // also requires STEAM_API_KEY to be present.
  process.env.STEAM_API_KEY = "test-api-key"
  process.env.SESSION_SECRET = "unit-test-session-secret"
})

describe("session signing", () => {
  it("round-trips a signed session", () => {
    const token = signSession(USER)
    expect(token).toContain(".")
    expect(verifySession(token)).toEqual(USER)
  })

  it("rejects a forged payload with no/invalid signature (the core fix)", () => {
    // What an attacker who knows a whitelisted Steam64 ID would try: a plain
    // JSON cookie like the old format.
    const forged = JSON.stringify({ steamId: "76561198023709299" })
    expect(verifySession(forged)).toBeNull()
    expect(verifySession(Buffer.from(forged).toString("base64url") + ".deadbeef")).toBeNull()
  })

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signSession(USER)
    const [payload, sig] = token.split(".")
    // Flip the payload to a different Steam ID, keep the old signature.
    const tampered = Buffer.from(JSON.stringify({ ...USER, steamId: "00000000000000000" })).toString("base64url")
    expect(verifySession(`${tampered}.${sig}`)).toBeNull()
    // Sanity: the untouched token still verifies.
    expect(verifySession(`${payload}.${sig}`)).toEqual(USER)
  })

  it("returns null for missing / malformed tokens", () => {
    expect(verifySession(undefined)).toBeNull()
    expect(verifySession(null)).toBeNull()
    expect(verifySession("")).toBeNull()
    expect(verifySession("nodothere")).toBeNull()
    expect(verifySession(".sigonly")).toBeNull()
  })
})
