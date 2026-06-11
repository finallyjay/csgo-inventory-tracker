"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Shield, LogOut, Boxes, LineChart } from "lucide-react"
import type { SteamUser } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { clearCurrentUser } from "@/hooks/use-current-user"

export function SiteHeader({ user }: { user: SteamUser }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    clearCurrentUser()
    router.push("/")
  }

  return (
    <header className="bg-card/50 sticky top-0 z-40 border-b backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="text-accent text-xl">CS:GO Tracker</span>
        </Link>

        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5">
              <Boxes className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>

          <Button asChild variant="ghost" size="sm">
            <Link href="/history" className="inline-flex items-center gap-1.5">
              <LineChart className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">History</span>
            </Link>
          </Button>

          {user.isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin" className="inline-flex items-center gap-1.5">
                <Shield className="h-4 w-4" aria-hidden="true" />
                Admin
              </Link>
            </Button>
          )}

          <a
            href={user.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
            title={user.displayName}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatar} alt="" width={28} height={28} className="border-surface-4 h-7 w-7 border" />
            <span className="hidden text-sm sm:inline">{user.displayName}</span>
          </a>

          <Button variant="outline" size="sm" onClick={handleLogout} className="inline-flex items-center gap-1.5">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
