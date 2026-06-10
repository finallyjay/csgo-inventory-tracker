import { describe, it, expect } from "vitest"
import { cn, formatPlaytime } from "@/lib/utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b")
  })
})

describe("formatPlaytime", () => {
  it("formats sub-hour durations in minutes", () => {
    expect(formatPlaytime(0.5)).toBe("30m")
  })

  it("formats whole hours", () => {
    expect(formatPlaytime(3)).toBe("3h")
  })

  it("formats hours and minutes", () => {
    expect(formatPlaytime(2.5)).toBe("2h 30m")
  })
})
