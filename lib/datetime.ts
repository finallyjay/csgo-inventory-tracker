// Client-safe date/time formatting. The database always stores UTC; this layer
// renders for the viewer only. Timezone resolution order:
//   NEXT_PUBLIC_DISPLAY_TIMEZONE (explicit override) → browser tz → UTC.

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The timezone used for displaying real timestamps. */
export function displayTimeZone(): string {
  const override = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE
  if (override && isValidTimeZone(override)) return override
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * Formats a 'YYYY-MM-DD' **UTC calendar day** (a snapshot bucket key). The day is
 * intentionally NOT shifted by timezone — it's a UTC bucket — only locale-formatted.
 */
export function formatDay(
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString(undefined, { timeZone: "UTC", ...opts })
}

/**
 * Formats a full ISO timestamp (a real point in time) in the viewer's timezone.
 */
export function formatDateTime(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString(undefined, { timeZone: displayTimeZone(), ...opts })
  } catch {
    return d.toLocaleString(undefined, { timeZone: "UTC", ...opts })
  }
}
