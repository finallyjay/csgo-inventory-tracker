import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { NextRequest } from "next/server"

// This is a route handler (App Router), so it's imported and invoked
// directly with a hand-built NextRequest rather than through an HTTP client
// — same approach as the other lib-level tests in this repo, just aimed at
// an `app/api/**/route.ts` export.
//
// listProfileSteamIds() reads straight from sqlite (no mocking needed): with
// a fresh temp DB and no steam_profile rows, it naturally returns [], so a
// successful auth check exercises the full route body without touching the
// network.
const dbPath = join(tmpdir(), `csgo-cron-snapshot-route-test-${process.pid}.sqlite`)

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
  process.env.STEAM_API_KEY = "test-api-key"
  process.env.CRON_SECRET = "test-cron-secret"
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function makeRequest(authHeader?: string) {
  return new NextRequest("http://localhost/api/cron/snapshot-inventory", {
    headers: authHeader ? { authorization: authHeader } : undefined,
  })
}

describe("GET /api/cron/snapshot-inventory — bearer auth contract", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const { GET } = await import("@/app/api/cron/snapshot-inventory/route")
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 401 when the bearer token doesn't match CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/cron/snapshot-inventory/route")
    const res = await GET(makeRequest("Bearer wrong-secret"))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })

  it("returns 401 for a same-length-mismatched bearer token (guards the timing-safe comparison's length branch)", async () => {
    const { GET } = await import("@/app/api/cron/snapshot-inventory/route")
    // Same byte length as "Bearer test-cron-secret" so this exercises the
    // timingSafeEqual() call itself, not just the length short-circuit.
    const res = await GET(makeRequest("Bearer test-cron-secre1"))
    expect(res.status).toBe(401)
  })

  it("proceeds (200) when the bearer token matches CRON_SECRET", async () => {
    const { GET } = await import("@/app/api/cron/snapshot-inventory/route")
    const res = await GET(makeRequest("Bearer test-cron-secret"))
    expect(res.status).toBe(200)
    // No profiles in the fresh temp DB, so the loop body never runs — this
    // confirms the auth gate let the request through to the real handler
    // logic rather than asserting anything about inventory valuation.
    expect(await res.json()).toEqual({ processed: 0, recorded: 0, failures: [] })
  })
})

describe("GET /api/cron/snapshot-inventory — fails closed with no CRON_SECRET configured", () => {
  it("returns 503 instead of accepting any bearer token", async () => {
    vi.resetModules()
    vi.stubEnv("CRON_SECRET", undefined)
    const { GET } = await import("@/app/api/cron/snapshot-inventory/route")
    const res = await GET(makeRequest("Bearer anything-at-all"))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "CRON_SECRET not configured" })
  })
})
