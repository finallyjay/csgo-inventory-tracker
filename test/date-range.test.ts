import { describe, it, expect } from "vitest"
import { cutoffForRange, filterByRange, DATE_RANGES } from "@/lib/date-range"

const TODAY = "2026-06-30"

describe("cutoffForRange", () => {
  it("computes the lower bound for each fixed range", () => {
    expect(cutoffForRange("7d", TODAY)).toBe("2026-06-23")
    expect(cutoffForRange("30d", TODAY)).toBe("2026-05-31")
    expect(cutoffForRange("90d", TODAY)).toBe("2026-04-01")
  })

  it("returns null for 'all'", () => {
    expect(cutoffForRange("all", TODAY)).toBeNull()
  })

  it("handles month/year boundaries", () => {
    expect(cutoffForRange("7d", "2026-01-03")).toBe("2025-12-27")
  })
})

describe("filterByRange", () => {
  const points = [
    { snapshotDate: "2026-04-01", v: 1 },
    { snapshotDate: "2026-05-31", v: 2 },
    { snapshotDate: "2026-06-23", v: 3 },
    { snapshotDate: "2026-06-30", v: 4 },
  ]

  it("keeps points on/after the cutoff (inclusive)", () => {
    expect(filterByRange(points, "7d", TODAY).map((p) => p.v)).toEqual([3, 4])
    expect(filterByRange(points, "30d", TODAY).map((p) => p.v)).toEqual([2, 3, 4])
  })

  it("returns everything for 'all'", () => {
    expect(filterByRange(points, "all", TODAY)).toHaveLength(4)
  })

  it("returns empty when nothing falls in range", () => {
    const old = [{ snapshotDate: "2020-01-01", v: 1 }]
    expect(filterByRange(old, "7d", TODAY)).toEqual([])
  })
})

describe("DATE_RANGES", () => {
  it("exposes the four expected ranges in order", () => {
    expect(DATE_RANGES.map((r) => r.key)).toEqual(["7d", "30d", "90d", "all"])
  })
})
