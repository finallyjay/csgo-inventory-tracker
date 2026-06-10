"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Sticker } from "@/lib/types/api"

/**
 * A single applied sticker shown as a small thumbnail. On hover, a floating
 * tooltip (portaled, so it's never clipped by the card) pops up above it with a
 * large preview and the sticker's name — which Steam always provides via the
 * `title="Sticker: …"` attribute.
 */
export function StickerBadge({ sticker }: { sticker: Sticker }) {
  return (
    <Tooltip delayDuration={80}>
      <TooltipTrigger asChild>
        <span className="border-surface-4/60 inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded border">
          {sticker.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sticker.image} alt={sticker.name} loading="lazy" className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xs" aria-hidden="true">
              🏷
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="flex w-auto max-w-[160px] flex-col items-center gap-2 p-3">
        {sticker.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sticker.image} alt={sticker.name} className="h-28 w-28 rounded bg-white/5 object-contain p-1" />
        )}
        <span className="text-center text-xs leading-tight font-medium">{sticker.name}</span>
      </TooltipContent>
    </Tooltip>
  )
}
