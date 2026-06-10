import type { SteamUser } from "@/lib/auth"

export type AuthMeResponse = {
  user: SteamUser | null
}

export type AllowedUser = {
  steamId: string
  addedBy: string | null
  addedAt: string
}

export type AllowedUsersResponse = {
  users: AllowedUser[]
}

export type InventoryValueSnapshot = {
  /** UTC calendar day, 'YYYY-MM-DD'. */
  snapshotDate: string
  currency: string
  /** Total inventory value in minor units (e.g. cents). */
  totalValue: number
  /** Total items in the inventory on that day. */
  itemCount: number
  /** Items we had a market price for (the rest counted as 0). */
  pricedItemCount: number
  /** ISO timestamp of when the snapshot was computed. */
  computedAt: string
}

export type InventoryValueHistoryResponse = {
  history: InventoryValueSnapshot[]
}

export type Sticker = {
  name: string
  image: string | null
}

export type InventoryItemView = {
  key: string
  name: string
  marketHashName: string | null
  iconUrl: string | null
  marketable: boolean
  count: number
  rarity: string | null
  rarityColor: string | null
  type: string | null
  exterior: string | null
  stickers: Sticker[]
  /** Cached unit price in minor units, or null if unknown / no price. */
  unitPrice: number | null
  /** unitPrice * count, or null when there's no price. */
  lineTotal: number | null
}

export type ItemMeta = {
  marketHashName: string
  name: string
  iconUrl: string | null
  rarity: string | null
  rarityColor: string | null
  type: string | null
  exterior: string | null
}

export type ItemPricePoint = {
  snapshotDate: string
  /** Price in minor units (e.g. cents). */
  price: number
}

export type InventoryItemsResponse = {
  items: InventoryItemView[]
  currency: string
  totalItemCount: number
  /** Sum of known line totals (minor units). */
  totalValue: number
  /** How many item rows had a cached price. */
  pricedRows: number
  /** True when no prices are cached yet (prompt the user to sync). */
  needsSync: boolean
}

export type HoldingItem = {
  marketHashName: string
  /** Display name from item metadata, falling back to market_hash_name. */
  name: string
  iconUrl: string | null
  rarityColor: string | null
  /** Wear condition (Factory New … Battle-Scarred), if applicable. */
  exterior: string | null
  /** Applied stickers (last known for this user+item). */
  stickers: Sticker[]
  count: number
  /** Unit price that day in minor units, or null if unpriced. */
  unitPrice: number | null
  /** unitPrice * count, or null when unpriced. */
  lineTotal: number | null
}

export type InventoryHoldingsResponse = {
  /** The day these holdings are for ('YYYY-MM-DD'), or null if none recorded. */
  snapshotDate: string | null
  currency: string
  items: HoldingItem[]
  /** Sum of known line totals that day (minor units). */
  totalValue: number
  /** Dates that have a holdings snapshot, newest first — for a date picker. */
  availableDates: string[]
}
