"use client"

import { useState } from "react"
import { Trash2, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputFrame } from "@/components/ui/input-frame"
import { surfaceCardVariants } from "@/components/ui/surface-card"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/hooks/use-toast"
import type { AllowedUser, AllowedUsersResponse } from "@/lib/types/api"

export function WhitelistManager({ initialUsers }: { initialUsers: AllowedUser[] }) {
  const [users, setUsers] = useState<AllowedUser[]>(initialUsers)
  const [steamId, setSteamId] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = steamId.trim()
    if (!trimmed) return

    setBusy(true)
    try {
      const res = await fetch("/api/admin/allowed-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: trimmed }),
      })
      const data = (await res.json()) as AllowedUsersResponse | { error: string }
      if (!res.ok) {
        toast({
          title: "Could not add user",
          description: "error" in data ? data.error : "Unknown error",
          variant: "destructive",
        })
        return
      }
      setUsers((data as AllowedUsersResponse).users)
      setSteamId("")
      toast({ title: "User added to whitelist" })
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/allowed-users?steamId=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as AllowedUsersResponse | { error: string }
      if (!res.ok) {
        toast({
          title: "Could not remove user",
          description: "error" in data ? data.error : "Unknown error",
          variant: "destructive",
        })
        return
      }
      setUsers((data as AllowedUsersResponse).users)
      toast({ title: "User removed from whitelist" })
    } catch {
      toast({ title: "Network error", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <InputFrame className="flex-1">
          <Users className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="text"
            inputMode="numeric"
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            placeholder="Steam64 ID (17 digits)"
            aria-label="Steam64 ID"
            className="text-foreground placeholder:text-muted-foreground h-full w-full bg-transparent text-sm focus:outline-none"
          />
        </InputFrame>
        <Button type="submit" disabled={busy || !steamId.trim()} className="inline-flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyState message="No users in the whitelist yet." icon={<Users className="h-5 w-5" />} />
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.steamId} className={surfaceCardVariants({ variant: "admin-item" })}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{u.steamId}</p>
                <p className="text-muted-foreground text-2xs">
                  added {new Date(u.addedAt).toLocaleDateString()}
                  {u.addedBy ? ` · by ${u.addedBy}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(u.steamId)}
                disabled={busy}
                aria-label={`Remove ${u.steamId}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
