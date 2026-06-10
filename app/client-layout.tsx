"use client"

import { usePathname } from "next/navigation"
import { usePageTitle } from "@/components/ui/page-title-context"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { SiteHeader } from "@/components/site-header"
import { useCurrentUser } from "@/hooks/use-current-user"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, loading } = useCurrentUser()
  const { title } = usePageTitle()
  // The root path is the login screen — no header there.
  const isAppPage = pathname !== "/"

  return (
    <TooltipProvider delayDuration={300}>
      <a
        href="#main-content"
        className="focus:ring-accent sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white focus:ring-2 focus:outline-none"
      >
        Skip to content
      </a>

      {isAppPage &&
        (loading ? (
          <div className="bg-card/50 sticky top-0 z-40 border-b backdrop-blur-sm">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-48" />
              </div>
            </div>
          </div>
        ) : (
          user && <SiteHeader user={user} />
        ))}

      {title && <div className="w-full px-4 pt-7 pb-4 text-center text-3xl font-bold">{title}</div>}
      {/* tabIndex={-1} so the skip-to-content link can move keyboard focus
          here when activated (otherwise the focus ring stays on the link). */}
      <main id="main-content" tabIndex={-1} className="min-h-screen outline-none">
        {children}
      </main>
      <footer className="border-surface-4 bg-background relative border-t py-8">
        <div className="container mx-auto flex flex-col items-center gap-3 px-4 text-center">
          <p className="text-muted-foreground text-sm">
            Made with{" "}
            <span className="text-accent" aria-hidden="true">
              ❤
            </span>
            <span className="sr-only">love</span> by{" "}
            <a
              href="https://github.com/finallyjay"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-4 transition-colors"
            >
              finallyjay
            </a>
          </p>
          <p className="text-muted-foreground/60 inline-flex items-center gap-2 text-xs">
            <span>v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
            <span aria-hidden="true">·</span>
            <span>Not affiliated with Valve Corporation</span>
          </p>
        </div>
      </footer>
      <Toaster />
    </TooltipProvider>
  )
}
