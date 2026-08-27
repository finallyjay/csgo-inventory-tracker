import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SteamUser } from "@/lib/auth"

// The store backing useCurrentUser lives at module scope (listeners,
// currentUserState, inFlightRequest, requestGeneration), so each test needs
// a fresh module instance — otherwise state from one test would leak into
// the next. vi.resetModules() + a dynamic import gives every test its own
// copy while still exercising the real hook module.
async function loadHook() {
  return import("@/hooks/use-current-user")
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) }
}

function makeUser(id: string): SteamUser {
  return {
    steamId: id,
    displayName: `user-${id}`,
    avatar: `https://example.com/${id}.png`,
    profileUrl: `https://steamcommunity.com/profiles/${id}`,
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal("fetch", vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useCurrentUser revalidation race", () => {
  it("does not let a stale in-flight response overwrite a newer one", async () => {
    const { useCurrentUser } = await loadHook()

    const first = deferred<unknown>()
    const second = deferred<unknown>()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)

    const { result } = renderHook(() => useCurrentUser())

    // Initial mount effect kicks off the first (slow) request.
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A visibility change while the first request is still in flight starts
    // a second, superseding request — this is the revalidation race.
    setVisibility("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // The newer request resolves first with user B...
    await act(async () => {
      second.resolve(jsonResponse({ user: makeUser("B") }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.user?.steamId).toBe("B")

    // ...and the stale first request resolves afterwards with user A. Its
    // response must be discarded instead of clobbering the newer state.
    await act(async () => {
      first.resolve(jsonResponse({ user: makeUser("A") }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.user?.steamId).toBe("B")
    expect(result.current.loading).toBe(false)
  })

  it("still applies the result of a single, unsuperseded request", async () => {
    const { useCurrentUser } = await loadHook()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: makeUser("A") }))

    const { result } = renderHook(() => useCurrentUser())
    await flush()

    expect(result.current.user?.steamId).toBe("A")
    expect(result.current.loading).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("clearCurrentUser supersedes a slow in-flight request on logout", async () => {
    const { useCurrentUser, clearCurrentUser } = await loadHook()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const pending = deferred<unknown>()
    fetchMock.mockImplementationOnce(() => pending.promise)

    const { result } = renderHook(() => useCurrentUser())
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => {
      clearCurrentUser()
    })
    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)

    // The slow request that was in flight at logout time must not repopulate
    // the user after the state was cleared.
    await act(async () => {
      pending.resolve(jsonResponse({ user: makeUser("A") }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.user).toBeNull()
  })
})
