// Pure, client-safe date-range helpers shared by the chart components. Kept out
// of `server-only` so client charts can filter their already-loaded points
// without a refetch, and so the logic is unit-testable in isolation.

export type DateRange = "7d" | "30d" | "90d" | "all"

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
]

const RANGE_DAYS: Record<Exclude<DateRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

/** Today as a UTC 'YYYY-MM-DD' string. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Returns the inclusive lower-bound date ('YYYY-MM-DD') for a range, or null for
 * "all" (no lower bound). `today` is injectable so callers/tests control the
 * reference day.
 */
export function cutoffForRange(range: DateRange, today: string = todayUtc()): string | null {
  if (range === "all") return null
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - RANGE_DAYS[range])
  return d.toISOString().slice(0, 10)
}

/**
 * Filters a list of dated points to those on/after the range's cutoff. Works for
 * any point carrying a `snapshotDate` ('YYYY-MM-DD'), which both the value and
 * item-price histories do.
 */
export function filterByRange<T extends { snapshotDate: string }>(
  points: T[],
  range: DateRange,
  today: string = todayUtc(),
): T[] {
  const cutoff = cutoffForRange(range, today)
  if (!cutoff) return points
  return points.filter((p) => p.snapshotDate >= cutoff)
}
