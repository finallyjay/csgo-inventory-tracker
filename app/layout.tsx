import ClientLayout from "./client-layout"
import { PageTitleProvider } from "@/components/ui/page-title-context"
import type { Metadata } from "next"
import { VT323, Space_Mono } from "next/font/google"
import "./globals.css"

// Retro arcade / CRT theme (shared with steam-backlog-hunter).
// Space Mono becomes the body default (wired through --font-sans and --font-mono
// so every shadcn component and body text inherits it). VT323 is a display face
// reserved for headings, exposed as --font-vt323 and applied in globals.css
// via an @layer base rule on h1/h2/h3.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
})

const vt323 = VT323({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-vt323",
  display: "swap",
})

export const metadata: Metadata = {
  title: "CS:GO Inventory Tracker",
  description: "Track your CS:GO / CS2 inventory, item values, and float data in one place.",
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://csgo-inventory-tracker.tuckfow.com"),
  openGraph: {
    title: "CS:GO Inventory Tracker",
    description: "Track your CS:GO / CS2 inventory, item values, and float data in one place.",
    type: "website",
    url: "/",
  },
  other: {
    "og:logo": "/icon.svg",
  },
  twitter: {
    card: "summary_large_image",
    title: "CS:GO Inventory Tracker",
    description: "Track your CS:GO / CS2 inventory, item values, and float data in one place.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`dark font-sans ${vt323.variable} ${spaceMono.variable}`}>
        <PageTitleProvider>
          <ClientLayout>{children}</ClientLayout>
        </PageTitleProvider>
      </body>
    </html>
  )
}
