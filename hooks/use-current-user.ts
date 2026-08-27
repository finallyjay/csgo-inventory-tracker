"use client"

import { useEffect, useSyncExternalStore } from "react"
import { toast } from "@/hooks/use-toast"
import type { SteamUser } from "@/lib/auth"
import type { AuthMeResponse } from "@/lib/types/api"

type CurrentUserState = {
  user: SteamUser | null
  loading: boolean
}

const listeners = new Set<() => void>()
let currentUserState: CurrentUserState = {
  user: null,
  loading: true,
}
let inFlightRequest: Promise<void> | null = null
// Bumped every time an in-flight request is superseded (revalidation or a
// logout-triggered clear). A fetch only applies its result if the counter
// still matches the value it captured when it started, so a slow, stale
// response can never clobber the state written by a newer request.
let requestGeneration = 0

function emitState(nextState: CurrentUserState) {
  currentUserState = nextState
  listeners.forEach((listener) => listener())
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

const SERVER_SNAPSHOT: CurrentUserState = { user: null, loading: true }

function getSnapshot() {
  return currentUserState
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT
}

async function ensureCurrentUserLoaded(options?: { force?: boolean }): Promise<void> {
  if (inFlightRequest) {
    return inFlightRequest
  }

  // Already loaded — skip redundant fetches on navigation (but allow forced revalidation)
  if (!options?.force && !currentUserState.loading) {
    return
  }

  const generation = ++requestGeneration

  inFlightRequest = (async () => {
    try {
      const res = await fetch("/api/auth/me")
      if (generation !== requestGeneration) return
      if (res.ok) {
        const data = (await res.json()) as AuthMeResponse
        if (generation !== requestGeneration) return
        emitState({ user: data.user, loading: false })
      } else if (res.status >= 500) {
        toast({
          title: "Authentication error",
          description: "Could not fetch user. Please sign in again.",
          variant: "destructive",
        })
        emitState({ ...currentUserState, loading: false })
      } else {
        emitState({ ...currentUserState, loading: false })
      }
    } catch {
      if (generation !== requestGeneration) return
      toast({
        title: "Network error",
        description: "Could not connect to the authentication server.",
        variant: "destructive",
      })
      emitState({ ...currentUserState, loading: false })
    } finally {
      // Only the request that owns the current generation may clear the
      // in-flight marker — a superseded request must leave it for whichever
      // request replaced it.
      if (generation === requestGeneration) {
        inFlightRequest = null
      }
    }
  })()

  return inFlightRequest
}

async function revalidateCurrentUser(): Promise<void> {
  requestGeneration++
  inFlightRequest = null
  return ensureCurrentUserLoaded({ force: true })
}

export function clearCurrentUser() {
  requestGeneration++
  inFlightRequest = null
  emitState({ user: null, loading: false })
}

export function useCurrentUser() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    void ensureCurrentUserLoaded()
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void revalidateCurrentUser()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return state
}
