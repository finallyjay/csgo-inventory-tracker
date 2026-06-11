import { redirect } from "next/navigation"
import { getCurrentUser } from "@/app/lib/server-auth"
import { PageContainer } from "@/components/ui/page-container"
import { InventoryValuePanel } from "@/components/dashboard/inventory-value-panel"

export default async function HistoryPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  return (
    <PageContainer>
      <section className="mx-auto max-w-3xl py-10">
        <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">History</p>
        <h1 className="mt-2 text-4xl">Value over time</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          A daily snapshot of your inventory’s total value. Pick a point on the chart to see what you held that day.
        </p>

        <div className="mt-8">
          <InventoryValuePanel />
        </div>
      </section>
    </PageContainer>
  )
}
