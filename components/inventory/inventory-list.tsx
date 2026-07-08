"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Search, PackageOpen, AlertCircle, Info } from "lucide-react"
import { AnimatedText } from "@/components/ui/animated-text"
import { Button } from "@/components/ui/button"
import { InputFrame } from "@/components/ui/input-frame"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { StickerBadge } from "@/components/inventory/sticker-badge"
import { toast } from "@/hooks/use-toast"
import { formatPrice } from "@/lib/market"
import type { InventoryItemsResponse, InventoryItemView } from "@/lib/types/api"

type SortKey = "value-desc" | "value-asc" | "name-asc" | "count-desc"

const SORTS: { key: SortKey; label: string }[] = [
  { key: "value-desc", label: "Value ↓" },
  { key: "value-asc", label: "Value ↑" },
  { key: "name-asc", label: "Name A–Z" },
  { key: "count-desc", label: "Count ↓" },
]

function sortItems(items: InventoryItemView[], sort: SortKey): InventoryItemView[] {
  const copy = [...items]
  switch (sort) {
    case "value-desc":
      return copy.sort((a, b) => (b.lineTotal ?? -1) - (a.lineTotal ?? -1))
    case "value-asc":
      return copy.sort((a, b) => (a.lineTotal ?? Infinity) - (b.lineTotal ?? Infinity))
    case "name-asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case "count-desc":
      return copy.sort((a, b) => b.count - a.count)
  }
}

function ItemCard({ item, currency }: { item: InventoryItemView; currency: string }) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        <div
          className="border-surface-4 bg-surface-2 relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border"
          style={item.rarityColor ? { borderColor: `#${item.rarityColor}` } : undefined}
        >
          {item.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.iconUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <PackageOpen className="text-muted-foreground h-5 w-5" aria-hidden="true" />
          )}
          {item.count > 1 && (
            <span className="bg-background/80 text-2xs absolute right-0 bottom-0 px-1 font-mono">×{item.count}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm" title={item.name}>
            {item.name}
          </p>
          <p className="text-muted-foreground text-2xs truncate">
            {[item.type, item.exterior].filter(Boolean).join(" · ") ||
              (item.marketable ? "Marketable" : "Not marketable")}
          </p>
          {item.stickers.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {item.stickers.map((s, idx) => (
                <StickerBadge key={idx} sticker={s} />
              ))}
            </div>
          )}
        </div>

        <div className="text-right">
          {item.unitPrice != null ? (
            <>
              <p className="text-foreground text-sm">
                <AnimatedText text={formatPrice(item.lineTotal ?? 0, currency)} />
              </p>
              {item.count > 1 && (
                <p className="text-muted-foreground text-2xs">
                  <AnimatedText text={formatPrice(item.unitPrice, currency)} /> / unit
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-2xs">{item.marketable ? "—" : "No price"}</p>
          )}
        </div>
      </div>
    </>
  )

  // Marketable items (with a market_hash_name) link to their price-history page.
  if (item.marketHashName) {
    return (
      <Link
        href={`/inventory/${encodeURIComponent(item.marketHashName)}`}
        className={`${surfaceCardVariants({ variant: "default", hover: "accent" })} block`}
      >
        {body}
      </Link>
    )
  }

  return <div className={surfaceCardVariants({ variant: "default" })}>{body}</div>
}

export function InventoryList() {
  const [data, setData] = useState<InventoryItemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("value-desc")
  const [syncing, setSyncing] = useState(false)

  // `background` keeps the current list on screen (no skeleton swap) so the
  // price roll animations can play in place after a sync — including on
  // failure, where it toasts instead of wiping the mounted list.
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/inventory/items", { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? "Failed to load inventory."
        if (background) {
          toast({ title: "Refresh failed", description: message, variant: "destructive" })
          return
        }
        setError(message)
        setData(null)
        return
      }
      setData(body as InventoryItemsResponse)
    } catch {
      if (background) {
        toast({ title: "Network error while refreshing", variant: "destructive" })
        return
      }
      setError("Network error while loading inventory.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/inventory/sync", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        toast({ title: "Sync failed", description: body.error ?? "Unknown error", variant: "destructive" })
        return
      }
      toast({ title: "Prices refreshed", description: formatPrice(body.totalValue, body.currency) })
      await load(true)
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  const visible = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const filtered = q ? data.items.filter((i) => i.name.toLowerCase().includes(q)) : data.items
    return sortItems(filtered, sort)
  }, [data, query, sort])

  return (
    <div className="space-y-5">
      {/* Summary + sync */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {loading ? (
            <Skeleton className="h-8 w-40" />
          ) : data ? (
            <>
              <p className="text-accent text-3xl">
                <AnimatedText text={formatPrice(data.totalValue, data.currency)} />
              </p>
              <p className="text-muted-foreground text-2xs">
                {data.totalItemCount} items · {data.pricedRows} priced
              </p>
            </>
          ) : null}
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm" className="inline-flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing ? "Valuing…" : "Sync now"}
        </Button>
      </div>

      {data?.needsSync && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No prices cached yet. Hit “Sync now” to pull market prices for your items.
          </AlertDescription>
        </Alert>
      )}

      {data && data.steamReportedCount > data.totalItemCount && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Steam lists {data.steamReportedCount} items but only {data.totalItemCount} loaded here. Steam hides newly
            purchased or traded items from your public inventory for about 10 days, so recent additions won’t appear
            here until then — this clears up on its own, no action needed. Items locked by a trade hold (received in a
            trade and not yet tradable) also won’t show, as Steam keeps them out of the public inventory entirely.
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      {!error && (
        <div className="flex flex-wrap items-center gap-2">
          <InputFrame className="min-w-[200px] flex-1">
            <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              aria-label="Search items"
              className="text-foreground placeholder:text-muted-foreground h-full w-full bg-transparent text-sm focus:outline-none"
            />
          </InputFrame>
          <div className="flex items-center gap-1">
            {SORTS.map((s) => (
              <Button
                key={s.key}
                variant={sort === s.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          message={query ? "No items match your search." : "Your inventory looks empty."}
          icon={<PackageOpen className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <ItemCard key={item.key} item={item} currency={data?.currency ?? "USD"} />
          ))}
        </div>
      )}
    </div>
  )
}
