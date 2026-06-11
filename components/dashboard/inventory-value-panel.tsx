"use client"

import { useCallback, useEffect, useState } from "react"
import { Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronLeft, ChevronRight, PackageOpen, RefreshCw, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { EmptyState } from "@/components/ui/empty-state"
import { HoldingRow } from "@/components/inventory/holding-row"
import { toast } from "@/hooks/use-toast"
import { formatPrice } from "@/lib/market"
import { formatDay, formatDateTime } from "@/lib/datetime"
import { filterByRange, type DateRange } from "@/lib/date-range"
import { DateRangeSelector } from "@/components/charts/date-range-selector"
import type { InventoryHoldingsResponse, InventoryValueHistoryResponse, InventoryValueSnapshot } from "@/lib/types/api"

function ValueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="border-surface-4 bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{formatDay(p.date)}</p>
      <p className="text-foreground text-sm">{formatPrice(p.value, p.currency)}</p>
    </div>
  )
}

interface ChartPoint {
  date: string
  value: number
  currency: string
}

export function InventoryValuePanel() {
  const [history, setHistory] = useState<InventoryValueSnapshot[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [range, setRange] = useState<DateRange>("30d")
  // The day whose holdings are shown in the table below the chart. Null until the
  // first holdings load resolves (API returns the latest snapshot day).
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<InventoryHoldingsResponse | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/value-history", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as InventoryValueHistoryResponse
      setHistory(data.history)
    } catch {
      // non-fatal — the panel just stays empty
    }
  }, [])

  // Loads the holdings composition for a given day (latest when omitted) and
  // syncs `selectedDate` to whatever day the API resolved.
  const loadHoldings = useCallback(async (d?: string) => {
    setHoldingsLoading(true)
    try {
      const url = d ? `/api/inventory/holdings?date=${encodeURIComponent(d)}` : "/api/inventory/holdings"
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) return
      const body = (await res.json()) as InventoryHoldingsResponse
      setHoldings(body)
      if (body.snapshotDate) setSelectedDate(body.snapshotDate)
    } finally {
      setHoldingsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadHoldings()
  }, [load, loadHoldings])

  // Pick a day (from a chart click or the arrows) and refresh the table below.
  const selectDay = useCallback(
    (d: string) => {
      setSelectedDate(d)
      void loadHoldings(d)
    },
    [loadHoldings],
  )

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/inventory/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Sync failed", description: data.error ?? "Unknown error", variant: "destructive" })
        return
      }
      toast({ title: "Inventory valued", description: formatPrice(data.totalValue, data.currency) })
      // Refresh the chart and jump the table back to the (new) latest day.
      await Promise.all([load(), loadHoldings()])
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  // Headline value is always the most recent snapshot; the chart respects range.
  const latest = history?.[history.length - 1] ?? null
  const points: ChartPoint[] = filterByRange(history ?? [], range).map((s) => ({
    date: s.snapshotDate,
    value: s.totalValue,
    currency: s.currency,
  }))
  // Marker for the selected day — only drawn when it falls inside the visible window.
  const selectedPoint = selectedDate ? points.find((p) => p.date === selectedDate) : undefined

  // All snapshot days, oldest-first, for the ‹ › day stepper.
  const days = (history ?? []).map((s) => s.snapshotDate)
  const foundIdx = selectedDate ? days.indexOf(selectedDate) : -1
  const idx = foundIdx >= 0 ? foundIdx : days.length - 1
  const olderDay = idx > 0 ? days[idx - 1] : null
  const newerDay = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null
  const isLatestDay = days.length > 0 && idx === days.length - 1

  return (
    <div className={surfaceCardVariants({ variant: "default" })}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Inventory value</p>
          {latest ? (
            <p className="text-accent mt-1 text-4xl">{formatPrice(latest.totalValue, latest.currency)}</p>
          ) : (
            <p className="text-muted-foreground mt-1 text-2xl">—</p>
          )}
          {latest && (
            <p className="text-muted-foreground text-2xs mt-1">
              {latest.pricedItemCount} of {latest.itemCount} items priced · updated {formatDateTime(latest.computedAt)}
            </p>
          )}
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm" className="inline-flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing ? "Valuing…" : "Sync now"}
        </Button>
      </div>

      {history && history.length > 0 && (
        <div className="mt-5 flex justify-end">
          <DateRangeSelector value={range} onChange={setRange} />
        </div>
      )}

      <div className={`mt-3 h-48 ${points.length >= 2 ? "cursor-pointer" : ""}`}>
        {points.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              onClick={(state) => {
                const label = (state as { activeLabel?: unknown }).activeLabel
                if (typeof label === "string" && label) selectDay(label)
              }}
            >
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(d: string) => formatDay(d, { month: "short", day: "numeric" })}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={48}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(v: number) => formatPrice(v, latest?.currency ?? "USD")}
              />
              <Tooltip content={<ValueTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                className="stroke-chart-1"
                stroke="currentColor"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              {selectedPoint && (
                <ReferenceDot
                  x={selectedPoint.date}
                  y={selectedPoint.value}
                  r={5}
                  className="fill-accent"
                  fill="currentColor"
                  stroke="none"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            message={
              !history || history.length === 0
                ? "No snapshots yet. Hit “Sync now” to value your inventory."
                : points.length === 1
                  ? "One snapshot in this range — the chart needs at least two days."
                  : "No snapshots in this range. Try a wider one."
            }
            icon={<TrendingUp className="h-5 w-5" />}
          />
        )}
      </div>

      {/* Holdings for the selected day — driven by the chart click / day stepper. */}
      {selectedDate && (
        <div className="border-surface-3 mt-5 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                onClick={() => olderDay && selectDay(olderDay)}
                disabled={!olderDay}
                aria-label="Older day"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="min-w-[120px] text-center">
                <p className="text-sm">{formatDay(selectedDate)}</p>
                {isLatestDay && <p className="text-muted-foreground text-2xs">latest</p>}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => newerDay && selectDay(newerDay)}
                disabled={!newerDay}
                aria-label="Newer day"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {holdings && (
              <div className="text-right">
                <p className="text-accent text-2xl">{formatPrice(holdings.totalValue, holdings.currency)}</p>
                <p className="text-muted-foreground text-2xs">{holdings.items.length} distinct items</p>
              </div>
            )}
          </div>

          <div className={`mt-4 ${holdingsLoading ? "opacity-50" : ""}`}>
            {!holdings || holdings.items.length === 0 ? (
              <EmptyState message="No items recorded for this day." icon={<PackageOpen className="h-5 w-5" />} />
            ) : (
              <ul className="space-y-2">
                {holdings.items.map((item) => (
                  <HoldingRow key={item.marketHashName} item={item} currency={holdings.currency} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
