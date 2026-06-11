import "server-only"

import { CS2_APP_ID, CS2_CONTEXT_ID } from "@/lib/market"
import { logger } from "@/lib/server/logger"

interface SteamAsset {
  classid: string
  instanceid: string
  amount: string
}

interface SteamTag {
  category?: string
  internal_name?: string
  localized_category_name?: string
  localized_tag_name?: string
  color?: string
}

interface SteamDescriptionLine {
  type?: string
  value?: string
  name?: string
}

interface SteamDescription {
  classid: string
  instanceid: string
  market_hash_name?: string
  name?: string
  icon_url?: string
  marketable?: number
  tradable?: number
  name_color?: string
  tags?: SteamTag[]
  descriptions?: SteamDescriptionLine[]
}

/** An applied sticker: its name and (when present) its icon URL. */
export interface Sticker {
  name: string
  image: string | null
}

export interface RawInventoryResponse {
  assets?: SteamAsset[]
  descriptions?: SteamDescription[]
  total_inventory_count?: number
  success?: number
  /** 1 when more pages remain; pass `last_assetid` as `start_assetid` to fetch them. */
  more_items?: number
  last_assetid?: string
}

/** A fully-described inventory line: one unique item with the count owned. */
export interface DetailedInventoryItem {
  /** Stable aggregation/render key. */
  key: string
  /** market_hash_name (null for unmarketable items that lack one). */
  marketHashName: string | null
  name: string
  /** Absolute icon URL, or null when Steam gave no icon. */
  iconUrl: string | null
  marketable: boolean
  tradable: boolean
  count: number
  rarity: string | null
  /** Hex color (no leading '#') for the rarity, if any. */
  rarityColor: string | null
  type: string | null
  exterior: string | null
  /** Applied stickers (CS2 weapons), parsed from the item's description HTML. */
  stickers: Sticker[]
}

export interface DetailedInventory {
  items: DetailedInventoryItem[]
  /** Assets we actually received and parsed from Steam. */
  totalItemCount: number
  /**
   * Steam's own `total_inventory_count`. Can exceed `totalItemCount` when Steam's
   * public inventory JSON lags its counter — typically right after a Market
   * purchase — so the difference flags items not yet served by the API. (Trade-
   * held items are excluded from this count entirely, so they can't be detected.)
   */
  steamReportedCount: number
}

/** A unique marketable item with the number of copies owned (for valuation). */
export interface InventoryItem {
  marketHashName: string
  count: number
}

export interface ParsedInventory {
  /** Marketable items aggregated by market_hash_name. */
  items: InventoryItem[]
  /** Count of every asset in the inventory, marketable or not. */
  totalItemCount: number
}

const STEAM_IMAGE_BASE = "https://community.fastly.steamstatic.com/economy/image"

function tagValue(tags: SteamTag[] | undefined, category: string): SteamTag | undefined {
  return tags?.find((t) => t.category === category)
}

/**
 * Extracts applied stickers from a CS2 item's description lines. Steam embeds
 * them as an HTML block (`class="sticker_info"`) of `<img>` tags whose `title`
 * reads "Sticker: <name>". Returns [] when the item has none.
 *
 * Pure/string-only so it's unit-testable.
 */
export function parseStickers(descriptions: SteamDescriptionLine[] | undefined): Sticker[] {
  const block = descriptions?.find((d) => (d.value ?? "").includes("sticker_info"))
  if (!block?.value) return []

  const stickers: Sticker[] = []
  for (const tag of block.value.match(/<img\b[^>]*>/g) ?? []) {
    const src = /src="([^"]+)"/.exec(tag)?.[1] ?? null
    const title = /title="(?:Sticker:\s*)?([^"]+)"/.exec(tag)?.[1] ?? null
    if (title || src) stickers.push({ name: title ?? "Sticker", image: src })
  }
  return stickers
}

/**
 * Reduces a raw Steam inventory payload into fully-described items aggregated by
 * `market_hash_name` (falling back to display name for unmarketable items that
 * lack one). Includes icon, rarity, type and exterior pulled from Steam's tags.
 *
 * Pure function — no network — so it can be unit-tested with fixtures.
 */
export function parseInventoryItems(raw: RawInventoryResponse): DetailedInventory {
  const assets = raw.assets ?? []
  const descriptions = raw.descriptions ?? []

  const descByKey = new Map<string, SteamDescription>()
  for (const d of descriptions) {
    descByKey.set(`${d.classid}_${d.instanceid}`, d)
  }

  const byKey = new Map<string, DetailedInventoryItem>()
  let totalItemCount = 0

  for (const asset of assets) {
    const amount = Number.parseInt(asset.amount, 10) || 1
    totalItemCount += amount

    const desc = descByKey.get(`${asset.classid}_${asset.instanceid}`)
    if (!desc) continue

    const marketHashName = desc.market_hash_name ?? null
    const name = desc.name ?? marketHashName ?? "Unknown item"
    const stickers = parseStickers(desc.descriptions)

    // Items with different applied stickers are distinct, so fold the sticker
    // set into the aggregation key. Stackable items (cases, etc.) have no
    // stickers and still merge by name.
    const stickerSig = stickers.length ? `::${stickers.map((s) => s.name).join("|")}` : ""
    const key = `${marketHashName ?? `name:${name}`}${stickerSig}`

    const existing = byKey.get(key)
    if (existing) {
      existing.count += amount
      continue
    }

    const rarityTag = tagValue(desc.tags, "Rarity")
    byKey.set(key, {
      key,
      marketHashName,
      name,
      iconUrl: desc.icon_url ? `${STEAM_IMAGE_BASE}/${desc.icon_url}` : null,
      marketable: Boolean(desc.marketable),
      tradable: Boolean(desc.tradable),
      count: amount,
      rarity: rarityTag?.localized_tag_name ?? null,
      rarityColor: rarityTag?.color ?? desc.name_color ?? null,
      type: tagValue(desc.tags, "Type")?.localized_tag_name ?? null,
      exterior: tagValue(desc.tags, "Exterior")?.localized_tag_name ?? null,
      stickers,
    })
  }

  return {
    items: [...byKey.values()],
    totalItemCount,
    steamReportedCount: raw.total_inventory_count ?? totalItemCount,
  }
}

/**
 * Marketable-only view used by the valuation pipeline. Thin filter over
 * {@link parseInventoryItems} so there is a single source of truth.
 */
export function parseInventory(raw: RawInventoryResponse): ParsedInventory {
  const { items, totalItemCount } = parseInventoryItems(raw)
  return {
    items: items
      .filter((i) => i.marketable && i.marketHashName)
      .map((i) => ({ marketHashName: i.marketHashName as string, count: i.count })),
    totalItemCount,
  }
}

export class InventoryFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "InventoryFetchError"
  }
}

/**
 * Maps a Steam inventory fetch status to an HTTP status + user-facing message.
 *
 * Steam returns 400 (body `null`) or 403 when the CS2 inventory privacy is not
 * Public — distinct from a profile being private. 429 is a genuine rate limit.
 * Shared by the sync and items routes so the messaging stays consistent.
 */
export function inventoryErrorInfo(status: number): { status: number; message: string } {
  if (status === 429) {
    return { status: 429, message: "Steam is rate-limiting inventory requests. Please try again in a minute." }
  }
  if (status === 400 || status === 403) {
    return {
      status: 403,
      message:
        "Couldn't read your CS2 inventory. Set it to Public in Steam: Profile → Edit Profile → Privacy Settings → Inventory → Public.",
    }
  }
  return { status: 502, message: "Steam returned an unexpected response. Please try again later." }
}

// Steam rejects large `count` values with HTTP 400; 2000 is the safe page size.
// Inventories bigger than one page are walked via `start_assetid`.
const INVENTORY_PAGE_SIZE = 2000
const MAX_INVENTORY_PAGES = 10

/**
 * Fetches and JSON-parses a user's public CS2 inventory, following Steam's
 * `start_assetid` pagination and merging the pages. Throws
 * {@link InventoryFetchError} on a private/inaccessible inventory (400/403),
 * rate limit (429), or any other non-OK / unsuccessful response.
 *
 * @throws InventoryFetchError
 */
async function fetchInventoryRaw(steamId: string): Promise<RawInventoryResponse> {
  const merged: Required<Pick<RawInventoryResponse, "assets" | "descriptions">> & RawInventoryResponse = {
    assets: [],
    descriptions: [],
    success: 1,
    total_inventory_count: 0,
  }

  let startAssetId: string | undefined

  for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
    const url = new URL(`https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/${CS2_CONTEXT_ID}`)
    url.searchParams.set("l", "english")
    url.searchParams.set("count", String(INVENTORY_PAGE_SIZE))
    if (startAssetId) url.searchParams.set("start_assetid", startAssetId)

    const res = await fetch(url, { headers: { Accept: "application/json" } })
    if (!res.ok) {
      logger.info({ steamId, status: res.status, page }, "Inventory fetch failed")
      throw new InventoryFetchError(`Steam inventory fetch returned ${res.status}`, res.status)
    }

    const raw = (await res.json()) as RawInventoryResponse
    if (raw.success !== undefined && raw.success !== 1) {
      throw new InventoryFetchError("Steam inventory response was not successful", res.status)
    }

    merged.assets.push(...(raw.assets ?? []))
    merged.descriptions.push(...(raw.descriptions ?? []))
    merged.total_inventory_count = raw.total_inventory_count ?? merged.total_inventory_count

    if (!raw.more_items || !raw.last_assetid) break
    startAssetId = raw.last_assetid
  }

  return merged
}

/** Fetches the inventory as marketable items (for valuation). */
export async function fetchInventory(steamId: string): Promise<ParsedInventory> {
  return parseInventory(await fetchInventoryRaw(steamId))
}

/** Fetches the inventory as fully-described items (for the item list page). */
export async function fetchInventoryItems(steamId: string): Promise<DetailedInventory> {
  return parseInventoryItems(await fetchInventoryRaw(steamId))
}
