import { redirect } from "next/navigation"
import { getCurrentUser } from "@/app/lib/server-auth"
import { PageContainer } from "@/components/ui/page-container"
import { SurfaceCard } from "@/components/ui/surface-card"
import { InventoryValuePanel } from "@/components/dashboard/inventory-value-panel"

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  return (
    <PageContainer>
      <section className="mx-auto max-w-3xl py-10">
        <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Signed in</p>
        <h1 className="mt-2 text-4xl">Welcome, {user.displayName}</h1>
        <p className="text-muted-foreground mt-3">
          You&apos;re authenticated via Steam. Inventory syncing isn&apos;t wired up yet — this is the authenticated
          home.
        </p>

        <div className="mt-8">
          <InventoryValuePanel />
        </div>

        <SurfaceCard className="mt-6 space-y-2">
          <p className="text-muted-foreground text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Steam ID</p>
          <p className="font-mono text-lg">{user.steamId}</p>
          {user.isAdmin && (
            <p className="text-accent text-xs">You have admin access — manage the whitelist under /admin.</p>
          )}
        </SurfaceCard>
      </section>
    </PageContainer>
  )
}
