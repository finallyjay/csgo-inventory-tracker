import "server-only"

import crypto from "node:crypto"
import { env } from "@/lib/env"
import type { SteamUser } from "@/lib/auth"

// HMAC key for signing the session cookie. SESSION_SECRET is required in
// production (see lib/env.ts); in development/test only, we fall back to
// STEAM_API_KEY (also a server-only secret) so sessions are tamper-proof
// without requiring a new env var.
function signingKey(): string {
  return env.SESSION_SECRET || env.STEAM_API_KEY
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url")
}

/**
 * Session lifetime in seconds. Kept in sync with the `steam_user` cookie's
 * `maxAge` (see the Steam auth callback) so the server-enforced `exp` and the
 * client-side cookie expiry line up (7 days).
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000

/** The signed payload: the user plus issued-at/expiry timestamps (epoch ms). */
interface SessionClaims extends SteamUser {
  iat: number
  exp: number
}

/**
 * Encodes a user into a signed session token: `<base64url(json)>.<hmac>`.
 * The signature is what makes the cookie tamper-proof — a forged payload (even
 * with a whitelisted Steam ID) won't carry a valid HMAC. An `exp` timestamp is
 * embedded and signed so a stolen cookie can't outlive its window even if it's
 * replayed with a fresh client-side cookie expiry.
 *
 * @param now Injectable clock (epoch ms) for testing; defaults to `Date.now()`.
 */
export function signSession(user: SteamUser, now: number = Date.now()): string {
  const claims: SessionClaims = { ...user, iat: now, exp: now + SESSION_TTL_MS }
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  return `${payload}.${hmac(payload)}`
}

/**
 * Verifies a session token and returns the user, or null if the token is
 * missing, malformed, its signature doesn't match (tampered/forged), or it has
 * expired. Expiry is enforced against the signed `exp` claim, not the cookie's
 * client-controlled `maxAge`.
 *
 * @param now Injectable clock (epoch ms) for testing; defaults to `Date.now()`.
 */
export function verifySession(token: string | undefined | null, now: number = Date.now()): SteamUser | null {
  if (!token) return null

  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null

  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = hmac(payload)
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims
    // Reject tokens with no/invalid or elapsed expiry. Legacy tokens minted
    // before `exp` existed have none and are refused — forcing a clean re-login.
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || now >= claims.exp) {
      return null
    }
    const { iat: _iat, exp: _exp, ...user } = claims
    return user
  } catch {
    return null
  }
}
