import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync } from "node:fs"
import { getCachedRawInventory, setCachedRawInventory } from "@/lib/server/steam-inventory-cache"
import type { RawInventoryResponse } from "@/lib/server/steam-inventory"

const dbPath = join(tmpdir(), `csgo-inventory-cache-test-${process.pid}.sqlite`)

beforeAll(() => {
  process.env.SQLITE_PATH = dbPath
})

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true })
})

const RAW: RawInventoryResponse = {
  success: 1,
  total_inventory_count: 1,
  assets: [{ classid: "1", instanceid: "0", amount: "1" }],
  descriptions: [{ classid: "1", instanceid: "0", market_hash_name: "AK-47 | Redline (Field-Tested)", marketable: 1 }],
}

describe("steam inventory raw cache", () => {
  it("round-trips a payload per steam id", () => {
    setCachedRawInventory("76561198000000001", RAW)

    expect(getCachedRawInventory("76561198000000001")).toEqual(RAW)
    expect(getCachedRawInventory("76561198000000002")).toBeNull()
  })

  it("misses when the entry is older than maxAgeMs (maxAgeMs: 0 always refetches)", () => {
    setCachedRawInventory("76561198000000001", RAW)
    expect(getCachedRawInventory("76561198000000001", 0)).toBeNull()
  })

  it("overwrites an existing entry for the same steam id", () => {
    setCachedRawInventory("76561198000000001", RAW)
    const updated: RawInventoryResponse = { ...RAW, total_inventory_count: 2 }
    setCachedRawInventory("76561198000000001", updated)

    expect(getCachedRawInventory("76561198000000001")?.total_inventory_count).toBe(2)
  })
})
