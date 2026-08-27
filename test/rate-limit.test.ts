import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"

const dbPath = join(tmpdir(), `csgo-rate-limit-test-${process.pid}.sqlite`)

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

describe("rateLimit", () => {
  it("allows requests under the limit and blocks once it's reached", async () => {
    const { rateLimit } = await import("@/lib/server/rate-limit")
    const key = "limit-test"

    expect(rateLimit(key, 2, 60_000)).toEqual({ success: true, remaining: 1 })
    expect(rateLimit(key, 2, 60_000)).toEqual({ success: true, remaining: 0 })
    // Third request within the window exceeds the limit of 2.
    expect(rateLimit(key, 2, 60_000)).toEqual({ success: false, remaining: 0 })
    expect(rateLimit(key, 2, 60_000)).toEqual({ success: false, remaining: 0 })
  })

  it("resets once the window has elapsed (sliding window, not a fixed reset point)", async () => {
    const { rateLimit } = await import("@/lib/server/rate-limit")
    const key = "window-test"
    const windowMs = 50

    expect(rateLimit(key, 1, windowMs).success).toBe(true)
    // Still inside the window: the one allowed slot is taken.
    expect(rateLimit(key, 1, windowMs).success).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, windowMs + 25))

    // The earlier timestamp has aged out of the window, so a new request fits.
    expect(rateLimit(key, 1, windowMs).success).toBe(true)
  })

  it("tracks independent keys in independent buckets", async () => {
    const { rateLimit } = await import("@/lib/server/rate-limit")

    expect(rateLimit("key-a", 1, 60_000).success).toBe(true)
    expect(rateLimit("key-a", 1, 60_000).success).toBe(false)
    // A different key has its own, unaffected budget.
    expect(rateLimit("key-b", 1, 60_000).success).toBe(true)
    expect(rateLimit("key-b", 1, 60_000).success).toBe(false)
  })

  it("persists buckets across a fresh limiter instance on the same SQLITE_PATH (the point of this module)", async () => {
    const key = "persistence-test"

    const first = await import("@/lib/server/rate-limit")
    expect(first.rateLimit(key, 3, 60_000)).toEqual({ success: true, remaining: 2 })
    expect(first.rateLimit(key, 3, 60_000)).toEqual({ success: true, remaining: 1 })

    // Simulate a cold start / a different serverless instance: close the
    // underlying connection and reset the module registry so re-importing
    // opens a brand-new DatabaseSync against the same file on disk, instead of
    // reusing the cached in-process connection. If state lived only in a
    // per-process Map (the old implementation), this second instance would
    // see an empty bucket and grant a fresh 3 requests.
    const { getSqliteDatabase } = await import("@/lib/server/sqlite")
    getSqliteDatabase().close()
    vi.resetModules()

    const second = await import("@/lib/server/rate-limit")

    // Only 1 request remains in this window -- the 2 recorded by "first" above
    // survived the restart.
    expect(second.rateLimit(key, 3, 60_000)).toEqual({ success: true, remaining: 0 })
    expect(second.rateLimit(key, 3, 60_000)).toEqual({ success: false, remaining: 0 })
  })
})
