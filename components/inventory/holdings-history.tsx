"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, PackageOpen, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HoldingRow } from "@/components/inventory/holding-row"
import { formatPrice } from "@/lib/market"
import { formatDay } from "@/lib/datetime"
import type { InventoryHoldingsResponse } from "@/lib/types/api"

export function HoldingsHistory() {
  const [data, setData] = useState<InventoryHoldingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  // The day currently shown. undefined on first load → API returns the latest.
  const [date, setDate] = useState<string | undefined>(undefined)

  const load = useCallback(async (d?: string) => {
    setLoading(true)
    try {
      const url = d ? `/api/inventory/holdings?date=${encodeURIComponent(d)}` : "/api/inventory/holdings"
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) return
      const body = (await res.json()) as InventoryHoldingsResponse
      setData(body)
      // Sync the selector to whatever day the API resolved (latest on first load).
      if (body.snapshotDate) setDate(body.snapshotDate)
    } finally {
      setLoading(false)
    }
  }, [])

  // Default: open on the most recent day (today, if synced today).
  useEffect(() => {
    void load()
  }, [load])

  function goto(d: string) {
    setDate(d)
    void load(d)
  }

  const dates = data?.availableDates ?? []
  const currentIndex = date ? dates.indexOf(date) : 0
  // dates are newest-first: older = higher index, newer = lower index.
  const olderDate = currentIndex >= 0 && currentIndex < dates.length - 1 ? dates[currentIndex + 1] : null
  const newerDate = currentIndex > 0 ? dates[currentIndex - 1] : null

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (!data || dates.length === 0) {
    return (
      <EmptyState
        message="No holdings snapshots yet. Sync your inventory to start recording a daily history."
        icon={<CalendarDays className="h-5 w-5" />}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Date selector + day navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => olderDate && goto(olderDate)}
            disabled={!olderDate}
            aria-label="Older day"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Select value={date} onValueChange={goto}>
            <SelectTrigger className="min-w-[160px]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <SelectValue placeholder="Pick a day" />
            </SelectTrigger>
            <SelectContent>
              {dates.map((d, idx) => (
                <SelectItem key={d} value={d}>
                  {formatDay(d)}
                  {idx === 0 ? " (latest)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => newerDate && goto(newerDate)}
            disabled={!newerDate}
            aria-label="Newer day"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="text-right">
          <p className="text-accent text-2xl">{formatPrice(data.totalValue, data.currency)}</p>
          <p className="text-muted-foreground text-2xs">{data.items.length} distinct items</p>
        </div>
      </div>

      {/* Holdings for the selected day */}
      {data.items.length === 0 ? (
        <EmptyState message="No items recorded for this day." icon={<PackageOpen className="h-5 w-5" />} />
      ) : (
        <ul className="space-y-2">
          {data.items.map((item) => (
            <HoldingRow key={item.marketHashName} item={item} currency={data.currency} />
          ))}
        </ul>
      )}
    </div>
  )
}
