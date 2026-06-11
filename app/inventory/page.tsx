import { redirect } from "next/navigation"

/**
 * The inventory list now lives on the dashboard (the post-login landing). This
 * index just forwards there so old links / bookmarks keep working; the per-item
 * detail pages at /inventory/[name] are unaffected.
 */
export default function InventoryIndexPage() {
  redirect("/dashboard")
}
