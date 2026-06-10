import { describe, it, expect, afterEach } from "vitest"
import { displayTimeZone, formatDay, formatDateTime } from "@/lib/datetime"

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE
})

describe("displayTimeZone", () => {
  it("uses NEXT_PUBLIC_DISPLAY_TIMEZONE when valid", () => {
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "Europe/Madrid"
    expect(displayTimeZone()).toBe("Europe/Madrid")
  })

  it("ignores an invalid override and falls back to the environment tz", () => {
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "Not/AZone"
    // Falls back to the runtime tz (or UTC) — just shouldn't be the bad value.
    expect(displayTimeZone()).not.toBe("Not/AZone")
  })
})

describe("formatDay (UTC bucket day — never shifted)", () => {
  it("renders the same calendar day regardless of the display timezone", () => {
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "Pacific/Kiritimati" // UTC+14
    const a = formatDay("2026-06-10")
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "Pacific/Midway" // UTC-11
    const b = formatDay("2026-06-10")
    expect(a).toBe(b)
    expect(a).toMatch(/2026/)
    expect(a).toMatch(/10/)
  })

  it("returns the raw value for an unparseable day", () => {
    expect(formatDay("not-a-date")).toBe("not-a-date")
  })
})

describe("formatDateTime (real timestamp — converted to the display tz)", () => {
  const iso = "2026-06-10T22:54:00Z" // 22:54 UTC on Jun 10

  it("shifts the day forward in a tz ahead of UTC", () => {
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "Europe/Madrid" // UTC+2 in summer → Jun 11 00:54
    const out = formatDateTime(iso, { year: "numeric", month: "2-digit", day: "2-digit" })
    expect(out).toContain("11")
  })

  it("keeps the same day in a tz behind UTC", () => {
    process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE = "America/New_York" // UTC-4 → Jun 10 18:54
    const out = formatDateTime(iso, { year: "numeric", month: "2-digit", day: "2-digit" })
    expect(out).toContain("10")
  })

  it("returns the raw value for an invalid timestamp", () => {
    expect(formatDateTime("nonsense")).toBe("nonsense")
  })
})
