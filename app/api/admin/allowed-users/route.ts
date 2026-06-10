import { NextResponse } from "next/server"
import { requireAdmin } from "@/app/lib/server-auth"
import { addAllowedUser, listAllowedUsers, removeAllowedUser } from "@/lib/server/allowed-users"
import { logger } from "@/lib/server/logger"
import type { AllowedUsersResponse } from "@/lib/types/api"

/**
 * GET /api/admin/allowed-users
 *
 * Returns the persisted whitelist. Admin only.
 *
 * @returns {{ users: AllowedUser[] }}
 * @throws 403 - Not an admin
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const response: AllowedUsersResponse = { users: listAllowedUsers() }
  return NextResponse.json(response)
}

/**
 * POST /api/admin/allowed-users
 *
 * Adds a Steam64 ID to the persisted whitelist. Admin only.
 *
 * @body {{ steamId: string }}
 * @returns {{ users: AllowedUser[] }} the updated list
 * @throws 400 - Invalid Steam ID · 403 - Not an admin
 */
export async function POST(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { steamId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const steamId = typeof body.steamId === "string" ? body.steamId.trim() : ""
  if (!addAllowedUser(steamId, admin.steamId)) {
    return NextResponse.json({ error: "Invalid Steam64 ID (expected 17 digits)" }, { status: 400 })
  }

  logger.info({ steamId, addedBy: admin.steamId }, "Allowed user added")
  const response: AllowedUsersResponse = { users: listAllowedUsers() }
  return NextResponse.json(response, { status: 201 })
}

/**
 * DELETE /api/admin/allowed-users?steamId=...
 *
 * Removes a Steam64 ID from the persisted whitelist. Admin only.
 *
 * @returns {{ users: AllowedUser[] }} the updated list
 * @throws 400 - Missing steamId · 403 - Not an admin
 */
export async function DELETE(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const steamId = new URL(request.url).searchParams.get("steamId")?.trim()
  if (!steamId) {
    return NextResponse.json({ error: "Missing steamId" }, { status: 400 })
  }

  removeAllowedUser(steamId)
  logger.info({ steamId, removedBy: admin.steamId }, "Allowed user removed")

  const response: AllowedUsersResponse = { users: listAllowedUsers() }
  return NextResponse.json(response)
}
