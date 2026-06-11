"use client"

import { PackageOpen } from "lucide-react"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { StickerBadge } from "@/components/inventory/sticker-badge"
import { formatPrice } from "@/lib/market"
import type { HoldingItem } from "@/lib/types/api"

/** A single row in a day's holdings list: icon, name, count, stickers, value. */
export function HoldingRow({ item, currency }: { item: HoldingItem; currency: string }) {
  const subtitle = [item.exterior, item.count > 1 ? `×${item.count}` : null].filter(Boolean).join(" · ")
  return (
    <li className={surfaceCardVariants({ variant: "row" })}>
      <div className="flex items-center gap-3">
        <div
          className="border-surface-4 bg-surface-2 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border"
          style={item.rarityColor ? { borderColor: `#${item.rarityColor}` } : undefined}
        >
          {item.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.iconUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <PackageOpen className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm" title={item.marketHashName}>
            {item.name}
          </p>
          {subtitle && <p className="text-muted-foreground text-2xs truncate">{subtitle}</p>}
          {item.stickers.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              {item.stickers.map((s, idx) => (
                <StickerBadge key={idx} sticker={s} />
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          {item.unitPrice != null ? (
            <>
              <p className="text-foreground text-sm">{formatPrice(item.lineTotal ?? 0, currency)}</p>
              {item.count > 1 && (
                <p className="text-muted-foreground text-2xs">{formatPrice(item.unitPrice, currency)} / unit</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-2xs">—</p>
          )}
        </div>
      </div>
    </li>
  )
}
