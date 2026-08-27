import "server-only"

import { getSqliteDatabase } from "@/lib/server/sqlite"

// Upper bound on how long any caller's window can be. Used only to decide when
// a bucket is stale enough to sweep away entirely (see `cleanup` below); the
// actual sliding window for a given call is always `windowMs`, not this.
const MAX_WINDOW_MS = 10 * 60_000

// Cleanup is probabilistic instead of running on every call: sweeping stale
// buckets is a full-table scan, and running it on every request would turn a
// cheap point lookup into O(n) work under load. Firing it on ~1% of calls
// keeps the table bounded (nothing outlives ~100x its own request rate without
// being swept) while keeping the common-case cost to a single indexed query.
const CLEANUP_PROBABILITY = 0.01

interface BucketRow {
  timestamps: string
  updated_at: number
}

/** Deletes buckets nothing has touched in longer than any window we support. */
function cleanupExpiredBuckets(now: number): void {
  const db = getSqliteDatabase()
  const cutoff = now - MAX_WINDOW_MS
  db.prepare("DELETE FROM rate_limit_bucket WHERE updated_at < ?").run(cutoff)
}

/**
 * Sliding-window rate limiter backed by SQLite.
 *
 * Each key tracks the exact epoch-ms timestamps of its recent requests. On
 * every call we drop timestamps older than `now - windowMs` (the sliding part
 * -- there are no fixed buckets that reset all at once) and check whether what
 * remains has hit `limit`. The read, filter, and write happen inside a single
 * transaction so two concurrent callers for the same key can't both read the
 * same pre-update state and both be admitted past the limit.
 *
 * Buckets live in the `rate_limit_bucket` table (see the v3 migration in
 * `lib/server/migrations.ts`), so state survives process restarts / cold
 * starts and is shared across every instance pointed at the same SQLITE_PATH
 * -- unlike the old per-process in-memory Map, where a "3 requests per 5
 * minutes" limit reset on every cold start and wasn't shared between
 * serverless instances.
 *
 * @param key - Identifier for the rate limit bucket (e.g. IP or user ID)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns Whether the request is allowed and how many requests remain
 */
export function rateLimit(key: string, limit: number, windowMs: number): { success: boolean; remaining: number } {
  const db = getSqliteDatabase()
  const now = Date.now()

  if (Math.random() < CLEANUP_PROBABILITY) {
    cleanupExpiredBuckets(now)
  }

  const windowStart = now - windowMs

  db.exec("BEGIN IMMEDIATE")
  try {
    const row = db.prepare("SELECT timestamps, updated_at FROM rate_limit_bucket WHERE key = ?").get(key) as
      | BucketRow
      | undefined

    const existing: number[] = row ? (JSON.parse(row.timestamps) as number[]) : []
    const timestamps = existing.filter((t) => t > windowStart)

    if (timestamps.length >= limit) {
      // Still persist the filtered (shrunk) list so an expired entry from a
      // stale window doesn't linger forever just because the limit keeps
      // getting hit.
      db.prepare(
        `INSERT INTO rate_limit_bucket (key, timestamps, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           timestamps = excluded.timestamps,
           updated_at = excluded.updated_at`,
      ).run(key, JSON.stringify(timestamps), now)
      db.exec("COMMIT")
      return { success: false, remaining: 0 }
    }

    timestamps.push(now)
    db.prepare(
      `INSERT INTO rate_limit_bucket (key, timestamps, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         timestamps = excluded.timestamps,
         updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(timestamps), now)
    db.exec("COMMIT")

    return { success: true, remaining: limit - timestamps.length }
  } catch (err) {
    try {
      db.exec("ROLLBACK")
    } catch {
      // The failing statement may have already aborted the transaction, in
      // which case ROLLBACK itself throws. Swallow that so the original
      // error is what propagates.
    }
    throw err
  }
}
