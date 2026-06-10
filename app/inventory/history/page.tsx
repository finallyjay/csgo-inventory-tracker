import { redirect } from "next/navigation"
import { getCurrentUser } from "@/app/lib/server-auth"
import { PageContainer } from "@/components/ui/page-container"
import { HoldingsHistory } from "@/components/inventory/holdings-history"

export default async function HoldingsHistoryPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  return (
    <PageContainer>
      <section className="mx-auto max-w-3xl py-10">
        <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Inventory</p>
        <h1 className="mt-2 text-4xl">Holdings history</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          A daily snapshot of which items you held and their value. Pick a day to see its composition.
        </p>

        <div className="mt-8">
          <HoldingsHistory />
        </div>
      </section>
    </PageContainer>
  )
}
