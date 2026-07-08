"use client"

import { useState } from "react"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { TrendingUp } from "lucide-react"
import { AnimatedText } from "@/components/ui/animated-text"
import { EmptyState } from "@/components/ui/empty-state"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { DateRangeSelector } from "@/components/charts/date-range-selector"
import { filterByRange, type DateRange } from "@/lib/date-range"
import { formatPrice } from "@/lib/market"
import { formatDay } from "@/lib/datetime"
import type { ItemPricePoint } from "@/lib/types/api"

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: Array<{ payload: ItemPricePoint }>
  currency: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="border-surface-4 bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{formatDay(p.snapshotDate)}</p>
      <p className="text-foreground text-sm">{formatPrice(p.price, currency)}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={surfaceCardVariants({ variant: "metric" })}>
      <span className="text-muted-foreground text-2xs tracking-[var(--tracking-eyebrow)] uppercase">{label}</span>
      <span className="text-foreground text-sm">
        <AnimatedText text={value} />
      </span>
    </div>
  )
}

export function ItemPriceChart({ points, currency }: { points: ItemPricePoint[]; currency: string }) {
  const [range, setRange] = useState<DateRange>("30d")

  if (points.length === 0) {
    return (
      <EmptyState
        message="No price history yet. Prices are recorded each day the inventory is synced."
        icon={<TrendingUp className="h-5 w-5" />}
      />
    )
  }

  const ranged = filterByRange(points, range)
  const prices = ranged.map((p) => p.price)
  const latest = prices.at(-1) ?? null
  const min = prices.length ? Math.min(...prices) : null
  const max = prices.length ? Math.max(...prices) : null
  const dash = "—"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-2xs">
          {ranged.length} point{ranged.length === 1 ? "" : "s"}
        </p>
        <DateRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Latest" value={latest != null ? formatPrice(latest, currency) : dash} />
        <Stat label="Low" value={min != null ? formatPrice(min, currency) : dash} />
        <Stat label="High" value={max != null ? formatPrice(max, currency) : dash} />
      </div>

      <div className="h-56">
        {ranged.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ranged} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis
                dataKey="snapshotDate"
                tick={{ fontSize: 10 }}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(d: string) => formatDay(d, { month: "short", day: "numeric" })}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={56}
                stroke="currentColor"
                className="text-muted-foreground"
                tickFormatter={(v: number) => formatPrice(v, currency)}
              />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Line
                type="monotone"
                dataKey="price"
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
              ranged.length === 1
                ? "One data point in this range — the chart needs at least two days."
                : "No data in this range. Try a wider one."
            }
            icon={<TrendingUp className="h-5 w-5" />}
          />
        )}
      </div>
    </div>
  )
}
