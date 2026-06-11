import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, PackageOpen, ExternalLink } from "lucide-react"
import { getCurrentUser } from "@/app/lib/server-auth"
import { env } from "@/lib/env"
import { getItemMeta } from "@/lib/server/item-meta"
import { getItemPriceHistory } from "@/lib/server/item-price-history"
import { getCachedPrices } from "@/lib/server/market-prices"
import { getLatestStickersForItem } from "@/lib/server/inventory-holdings"
import { PageContainer } from "@/components/ui/page-container"
import { Button } from "@/components/ui/button"
import { ItemPriceChart } from "@/components/inventory/item-price-chart"
import { StickerBadge } from "@/components/inventory/sticker-badge"
import { formatPrice, steamMarketUrl } from "@/lib/market"

export default async function ItemDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  // The dynamic segment is the encodeURIComponent'd market_hash_name; decode it
  // back. Guard against a stray '%' that isn't a valid escape.
  const { name } = await params
  let marketHashName: string
  try {
    marketHashName = decodeURIComponent(name)
  } catch {
    marketHashName = name
  }
  const currency = env.STEAM_MARKET_CURRENCY

  const meta = getItemMeta(marketHashName)
  const history = getItemPriceHistory(marketHashName, currency)
  const currentPrice = history.at(-1)?.price ?? getCachedPrices([marketHashName], currency).get(marketHashName) ?? null
  const stickers = getLatestStickersForItem(user.steamId, marketHashName)

  const displayName = meta?.name ?? marketHashName
  const subtitle = [meta?.type, meta?.exterior].filter(Boolean).join(" · ")
  const marketUrl = steamMarketUrl(marketHashName)

  return (
    <PageContainer>
      <section className="mx-auto max-w-3xl py-10">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to inventory
        </Link>

        <div className="mt-6 flex items-start gap-4">
          <div
            className="border-surface-4 bg-surface-2 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border"
            style={meta?.rarityColor ? { borderColor: `#${meta.rarityColor}` } : undefined}
          >
            {meta?.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={meta.iconUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <PackageOpen className="text-muted-foreground h-7 w-7" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl leading-tight break-words">{displayName}</h1>
            {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
            {meta?.rarity && <p className="text-accent text-2xs mt-1 uppercase">{meta.rarity}</p>}
            {stickers.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5">
                {stickers.map((s, idx) => (
                  <StickerBadge key={idx} sticker={s} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {currentPrice != null && (
              <div className="text-right">
                <p className="text-muted-foreground text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Price</p>
                <p className="text-accent text-3xl">{formatPrice(currentPrice, currency)}</p>
              </div>
            )}
            <Button asChild variant="outline" size="sm">
              <a
                href={marketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                Steam Market
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-muted-foreground text-2xs mb-3 tracking-[var(--tracking-eyebrow)] uppercase">
            Price history ({currency})
          </p>
          <ItemPriceChart points={history} currency={currency} />
        </div>
      </section>
    </PageContainer>
  )
}
