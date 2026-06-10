"use client"

import { Button } from "@/components/ui/button"
import { DATE_RANGES, type DateRange } from "@/lib/date-range"

/** Compact 7D/30D/90D/All toggle for filtering a chart's date range. */
export function DateRangeSelector({
  value,
  onChange,
  className = "",
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}) {
  return (
    <fieldset className={`m-0 flex items-center gap-1 border-0 p-0 ${className}`} aria-label="Date range">
      {DATE_RANGES.map((r) => (
        <Button
          key={r.key}
          variant={value === r.key ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(r.key)}
          aria-pressed={value === r.key}
        >
          {r.label}
        </Button>
      ))}
    </fieldset>
  )
}
