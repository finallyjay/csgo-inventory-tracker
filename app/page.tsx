"use client"

import { useEffect } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SurfaceCard } from "@/components/ui/surface-card"
import { AlertCircle, Boxes, LineChart, Crosshair } from "lucide-react"
import { useSearchParams, useRouter } from "next/navigation"
import { useCurrentUser } from "@/hooks/use-current-user"

export default function HomePage() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const { user, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !error) {
      router.push("/dashboard")
    }
  }, [loading, user, error, router])

  const handleSteamSignIn = () => {
    window.location.href = "/api/auth/steam"
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-10 text-center">
        <div className="space-y-4">
          <p className="text-accent text-2xs tracking-[var(--tracking-eyebrow)] uppercase">CS:GO · CS2</p>
          <h1 className="text-5xl sm:text-6xl">Inventory Tracker</h1>
          <p className="text-muted-foreground mx-auto max-w-sm text-base">
            Sign in with Steam to track your inventory, item values, floats and stickers.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="text-left">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error === "auth_failed" && "Steam authentication failed. Please try again."}
              {error === "auth_error" && "An error occurred during authentication. Please try again."}
              {error === "not_whitelisted" && "Your Steam account is not authorized for this app."}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <button type="button" onClick={handleSteamSignIn} className="group cursor-pointer">
            <img
              src="/steam-signin.png"
              alt="Sign in with Steam"
              className="mx-auto transition-opacity group-hover:opacity-80"
            />
          </button>
          <p className="text-muted-foreground text-2xs">
            Authenticates via Steam OpenID. Only your public profile and inventory are accessed.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <SurfaceCard className="space-y-2">
            <Boxes className="text-accent mx-auto h-5 w-5" />
            <p className="text-foreground text-xs font-medium">Inventory</p>
            <p className="text-muted-foreground text-2xs leading-snug">Skins, knives, gloves and cases at a glance.</p>
          </SurfaceCard>
          <SurfaceCard className="space-y-2">
            <LineChart className="text-accent mx-auto h-5 w-5" />
            <p className="text-foreground text-xs font-medium">Value</p>
            <p className="text-muted-foreground text-2xs leading-snug">Track portfolio worth over time.</p>
          </SurfaceCard>
          <SurfaceCard className="space-y-2">
            <Crosshair className="text-accent mx-auto h-5 w-5" />
            <p className="text-foreground text-xs font-medium">Floats</p>
            <p className="text-muted-foreground text-2xs leading-snug">Wear, patterns and applied stickers.</p>
          </SurfaceCard>
        </div>

        <p className="text-muted-foreground text-xs">Not affiliated with Valve Corporation.</p>
      </div>
    </div>
  )
}
