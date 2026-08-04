import "server-only"

import crypto from "node:crypto"

/**
 * Constant-time string comparison that is safe to call with inputs of
 * different lengths. `crypto.timingSafeEqual` throws a RangeError when the
 * buffers differ in length, so we check lengths first (mirroring the pattern
 * in lib/server/session.ts) — a length mismatch is simply "not equal", never
 * an exception an attacker can trigger.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false

  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Validates that an OpenID `return_to` URL belongs to our realm by comparing
 * parsed origins. A plain `startsWith` check would accept prefix-crafted
 * domains such as `https://app.com.evil.com` when the realm is
 * `https://app.com`; parsing both URLs and comparing origins does not.
 */
export function isReturnToAllowed(returnTo: string, expectedRealm: string): boolean {
  try {
    return new URL(returnTo).origin === new URL(expectedRealm).origin
  } catch {
    return false
  }
}
