// Pure, dependency-free market helpers. No `server-only` import so this can be
// shared by client components (e.g. for formatting) and unit-tested directly.

/** The CS2 / CS:GO app id on Steam. */
export const CS2_APP_ID = 730

/** Steam inventory context id for CS2 items. */
export const CS2_CONTEXT_ID = "2"

/** CS2 wear condition → Steam's `WearCategory` index (0 = best, 4 = worst). */
export const WEAR_CATEGORY: Record<string, number> = {
  "Factory New": 0,
  "Minimal Wear": 1,
  "Field-Tested": 2,
  "Well-Worn": 3,
  "Battle-Scarred": 4,
}

/**
 * Builds the Steam Community Market listing URL for a CS2 item.
 *
 * Steam now serves a single listing page per skin: the `market_hash_name`
 * (which includes the wear, e.g. "… (Field-Tested)") redirects to a generic
 * `G…` page that otherwise defaults to the wrong wear. The actual wear must be
 * passed as the `category_730_Exterior=tag_WearCategoryN` filter (it survives
 * the redirect). The wear is read from the name's trailing "(…)".
 */
export function steamMarketUrl(marketHashName: string): string {
  const base = `https://steamcommunity.com/market/listings/${CS2_APP_ID}/${encodeURIComponent(marketHashName)}`
  const wear = marketHashName.match(/\(([^()]+)\)\s*$/)?.[1]
  const category = wear ? WEAR_CATEGORY[wear] : undefined
  if (category === undefined) return base
  return `${base}?appid=${CS2_APP_ID}&category_${CS2_APP_ID}_Exterior=tag_WearCategory${category}`
}

/**
 * Supported currencies. `steamCode` is Steam Market's numeric `currency` param;
 * `minorPerMajor` is the minor-unit divisor for display; `locale` controls the
 * number format (decimal separator); `symbolAfter` puts the symbol after the
 * number, matching each currency's convention (e.g. EUR → "37,50€").
 */
export const CURRENCIES = {
  USD: { steamCode: 1, symbol: "$", minorPerMajor: 100, locale: "en-US", symbolAfter: false },
  GBP: { steamCode: 2, symbol: "£", minorPerMajor: 100, locale: "en-GB", symbolAfter: false },
  EUR: { steamCode: 3, symbol: "€", minorPerMajor: 100, locale: "de-DE", symbolAfter: true },
} as const

export type CurrencyCode = keyof typeof CURRENCIES

/** Returns the Steam Market numeric currency code, defaulting to USD (1). */
export function steamCurrencyCode(currency: string): number {
  return (CURRENCIES as Record<string, { steamCode: number }>)[currency]?.steamCode ?? 1
}

/**
 * Parses a localized Steam Market price string into integer minor units
 * (e.g. cents). Steam returns strings like "$1.23", "1,23€", "$1,234.56" or
 * "1.234,56 €". The last of `.` / `,` is treated as the decimal separator;
 * any earlier separators are thousands grouping and dropped.
 *
 * @returns minor units, or null if no number could be parsed.
 */
export function parsePriceToMinorUnits(raw: string | null | undefined): number | null {
  if (!raw) return null

  // Keep digits and separators only.
  const cleaned = raw.replace(/[^\d.,]/g, "")
  if (!cleaned) return null

  const lastDot = cleaned.lastIndexOf(".")
  const lastComma = cleaned.lastIndexOf(",")
  const decimalPos = Math.max(lastDot, lastComma)

  let normalized: string
  if (decimalPos === -1) {
    normalized = cleaned
  } else {
    const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, "")
    const fracPart = cleaned.slice(decimalPos + 1).replace(/[.,]/g, "")
    normalized = `${intPart}.${fracPart}`
  }

  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null

  return Math.round(value * 100)
}

/**
 * Formats integer minor units into a human-readable price for a currency,
 * placing the symbol per that currency's convention — e.g.
 * formatPrice(12345, "USD") === "$123.45", formatPrice(3750, "EUR") === "37,50€".
 */
export function formatPrice(minorUnits: number, currency: string): string {
  const meta = (
    CURRENCIES as Record<string, { symbol: string; minorPerMajor: number; locale: string; symbolAfter: boolean }>
  )[currency]
  const symbol = meta?.symbol ?? ""
  const divisor = meta?.minorPerMajor ?? 100
  const major = (minorUnits / divisor).toLocaleString(meta?.locale ?? "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return meta?.symbolAfter ? `${major}${symbol}` : `${symbol}${major}`
}
