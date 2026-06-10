"use client"

import { useCallback, useEffect, useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { RefreshCw, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/hooks/use-toast"
import { formatPrice } from "@/lib/market"
import { filterByRange, type DateRange } from "@/lib/date-range"
import { DateRangeSelector } from "@/components/charts/date-range-selector"
import type { InventoryValueHistoryResponse, InventoryValueSnapshot } from "@/lib/types/api"

function ValueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="border-surface-4 bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{p.date}</p>
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

  useEffect(() => {
    void load()
  }, [load])

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
      await load()
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
              {latest.pricedItemCount} of {latest.itemCount} items priced · as of {latest.snapshotDate}
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

      <div className="mt-3 h-48">
        {points.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
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
              />
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
    </div>
  )
}
