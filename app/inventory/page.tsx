import { redirect } from "next/navigation"
import { getCurrentUser } from "@/app/lib/server-auth"
import { PageContainer } from "@/components/ui/page-container"
import { InventoryList } from "@/components/inventory/inventory-list"

export default async function InventoryPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  return (
    <PageContainer>
      <section className="mx-auto max-w-5xl py-10">
        <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Inventory</p>
        <h1 className="mt-2 text-4xl">Your items</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Your CS2 inventory with cached market prices. Hit “Sync now” to refresh prices from the Steam Market.
        </p>

        <div className="mt-8">
          <InventoryList />
        </div>
      </section>
    </PageContainer>
  )
}
