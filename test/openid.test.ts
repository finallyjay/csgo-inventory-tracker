import { describe, it, expect } from "vitest"
import { safeEqual, isReturnToAllowed } from "@/lib/server/openid"

describe("safeEqual", () => {
  it("returns true for identical strings (valid nonce)", () => {
    const nonce = "a".repeat(32)
    expect(safeEqual(nonce, nonce)).toBe(true)
  })

  it("returns false (not throws) for strings of different lengths", () => {
    // crypto.timingSafeEqual throws RangeError on length mismatch; the helper
    // must treat it as a plain mismatch so the route redirects instead of 500ing.
    expect(() => safeEqual("short", "a-much-longer-nonce-value")).not.toThrow()
    expect(safeEqual("short", "a-much-longer-nonce-value")).toBe(false)
    expect(safeEqual("a-much-longer-nonce-value", "short")).toBe(false)
  })

  it("returns false for same-length but different strings", () => {
    expect(safeEqual("aaaa", "aaab")).toBe(false)
  })

  it("returns false for missing or empty inputs", () => {
    expect(safeEqual(null, "nonce")).toBe(false)
    expect(safeEqual(undefined, "nonce")).toBe(false)
    expect(safeEqual("nonce", undefined)).toBe(false)
    expect(safeEqual("", "")).toBe(false)
  })

  it("handles multi-byte characters without throwing", () => {
    // "é" is 1 char but 2 bytes in UTF-8; byte lengths are what matter.
    expect(safeEqual("é", "é")).toBe(true)
    expect(safeEqual("é", "ab")).toBe(false)
    expect(safeEqual("é", "e")).toBe(false)
  })
})

describe("isReturnToAllowed", () => {
  const realm = "https://app.example.com"

  it("accepts a return_to on the exact realm origin", () => {
    expect(isReturnToAllowed("https://app.example.com/api/auth/steam/callback?nonce=x", realm)).toBe(true)
    expect(isReturnToAllowed("https://app.example.com/", realm)).toBe(true)
  })

  it("accepts when the realm has a trailing path (origins still match)", () => {
    expect(isReturnToAllowed("https://app.example.com/api/auth/steam/callback", "https://app.example.com/")).toBe(true)
  })

  it("rejects prefix-crafted lookalike domains", () => {
    // These pass a naive startsWith(expectedRealm) check.
    expect(isReturnToAllowed("https://app.example.com.evil.com/callback", realm)).toBe(false)
    expect(isReturnToAllowed("https://app.example.com.evil.com", realm)).toBe(false)
    expect(isReturnToAllowed("https://app.example.computer/callback", realm)).toBe(false)
  })

  it("rejects other origins, schemes, and ports", () => {
    expect(isReturnToAllowed("https://evil.com/https://app.example.com", realm)).toBe(false)
    expect(isReturnToAllowed("http://app.example.com/callback", realm)).toBe(false)
    expect(isReturnToAllowed("https://app.example.com:8443/callback", realm)).toBe(false)
  })

  it("rejects unparseable inputs instead of throwing", () => {
    expect(isReturnToAllowed("", realm)).toBe(false)
    expect(isReturnToAllowed("not a url", realm)).toBe(false)
    expect(isReturnToAllowed("https://app.example.com/callback", "not a url")).toBe(false)
  })
})
