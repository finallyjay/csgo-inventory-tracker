import { redirect } from "next/navigation"
import { getCurrentUser } from "@/app/lib/server-auth"
import { listAllowedUsers } from "@/lib/server/allowed-users"
import { PageContainer } from "@/components/ui/page-container"
import { WhitelistManager } from "@/components/admin/whitelist-manager"

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }
  if (!user.isAdmin) {
    redirect("/dashboard")
  }

  const initialUsers = listAllowedUsers()

  return (
    <PageContainer>
      <section className="mx-auto max-w-2xl py-10">
        <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">Admin</p>
        <h1 className="mt-2 text-4xl">Whitelist</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Steam64 IDs allowed to sign in. The admin (set via <code className="text-foreground">ADMIN_STEAM_ID</code>)
          and any IDs in <code className="text-foreground">STEAM_WHITELIST_IDS</code> are always allowed in addition to
          this list.
        </p>

        <div className="mt-8">
          <WhitelistManager initialUsers={initialUsers} />
        </div>
      </section>
    </PageContainer>
  )
}
