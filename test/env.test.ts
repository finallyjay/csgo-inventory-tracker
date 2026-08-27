import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// lib/env.ts validates lazily and caches the result on first access, so each
// test needs a fresh module instance (vi.resetModules + dynamic import) to
// re-trigger validation against that test's process.env. NODE_ENV is typed
// read-only on process.env, so we use vi.stubEnv (which also auto-restores).
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("env validation: SESSION_SECRET", () => {
  it("falls back to STEAM_API_KEY outside production when unset, logging a warning", async () => {
    vi.stubEnv("STEAM_API_KEY", "test-api-key")
    vi.stubEnv("SESSION_SECRET", undefined)
    vi.stubEnv("NODE_ENV", "development")

    const { logger } = await import("@/lib/server/logger")
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never)

    const { env } = await import("@/lib/env")
    expect(env.SESSION_SECRET).toBeUndefined()
    expect(env.STEAM_API_KEY).toBe("test-api-key")
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_SECRET is not set"))

    warnSpy.mockRestore()
  })

  it("does not warn when SESSION_SECRET is set outside production", async () => {
    vi.stubEnv("STEAM_API_KEY", "test-api-key")
    vi.stubEnv("SESSION_SECRET", "dev-secret")
    vi.stubEnv("NODE_ENV", "development")

    const { logger } = await import("@/lib/server/logger")
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never)

    const { env } = await import("@/lib/env")
    expect(env.SESSION_SECRET).toBe("dev-secret")
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("fails fast when SESSION_SECRET is unset in production", async () => {
    vi.stubEnv("STEAM_API_KEY", "test-api-key")
    vi.stubEnv("SESSION_SECRET", undefined)
    vi.stubEnv("NODE_ENV", "production")

    const { env } = await import("@/lib/env")
    expect(() => env.SESSION_SECRET).toThrow("Invalid environment variables")
  })

  it("passes validation in production when SESSION_SECRET is set", async () => {
    vi.stubEnv("STEAM_API_KEY", "test-api-key")
    vi.stubEnv("SESSION_SECRET", "a-dedicated-prod-secret")
    vi.stubEnv("NODE_ENV", "production")

    const { env } = await import("@/lib/env")
    expect(env.SESSION_SECRET).toBe("a-dedicated-prod-secret")
  })
})
