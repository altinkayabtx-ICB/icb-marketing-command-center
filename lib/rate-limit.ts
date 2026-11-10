/**
 * Fixed-window limiter kept in process memory.
 *
 * This service runs as Vercel Functions. Each instance has its own memory,
 * and this repository has no shared store (no Redis, KV, or database) that
 * could coordinate counters across instances. Limits therefore apply only to
 * the instance that received the request, and they disappear when that
 * instance is recycled. That is a baseline spend guard, not a global quota.
 *
 * Authenticated runs and authentication failures use separate counters so a
 * flood of bad credentials cannot consume a valid caller's budget. Each
 * counter has:
 * - one bucket per client address
 * - one bucket for the whole instance, capped at
 *   ICB_RUN_RATE_LIMIT × INSTANCE_LIMIT_MULTIPLIER
 * The instance bucket stops a caller from raising the ceiling by rotating
 * the forwarded client address on a single instance.
 * Both counters use ICB_RUN_RATE_LIMIT and ICB_RUN_RATE_WINDOW_MS.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export const DEFAULT_RATE_LIMIT = 10;
export const DEFAULT_RATE_WINDOW_MS = 60_000;
export const INSTANCE_LIMIT_MULTIPLIER = 10;

const MAX_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

const buckets = new Map<string, Bucket>();

function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return fallback;
  return parsed;
}

function limitConfig() {
  return {
    limit: readPositiveInt("ICB_RUN_RATE_LIMIT", DEFAULT_RATE_LIMIT, MAX_LIMIT),
    windowMs: readPositiveInt(
      "ICB_RUN_RATE_WINDOW_MS",
      DEFAULT_RATE_WINDOW_MS,
      MAX_WINDOW_MS
    )
  };
}

function bucket(key: string, windowMs: number, now: number): Bucket {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const created = { count: 0, resetAt: now + windowMs };
    buckets.set(key, created);
    return created;
  }
  return existing;
}

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function firstHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    if (Array.isArray(value)) return value[0];
    return value;
  }
  return undefined;
}

export function clientRateLimitKey(req: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}): string {
  const forwarded = firstHeader(req.headers, "x-forwarded-for");
  const forwardedClient = forwarded?.split(",")[0]?.trim();
  if (forwardedClient) return forwardedClient.slice(0, 200);

  const remote = req.socket?.remoteAddress?.trim();
  if (remote) return remote.slice(0, 200);
  return "unknown";
}

export function consumeRateLimit(
  clientKey: string,
  scope: "run" | "auth" = "run"
): RateLimitDecision {
  const { limit, windowMs } = limitConfig();
  const instanceLimit = limit * INSTANCE_LIMIT_MULTIPLIER;
  const now = Date.now();

  if (buckets.size > 2000) {
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }

  const client = bucket(`${scope}:client:${clientKey}`, windowMs, now);
  const instance = bucket(`${scope}:instance`, windowMs, now);
  const clientBlocked = client.count >= limit;
  const instanceBlocked = instance.count >= instanceLimit;

  if (clientBlocked || instanceBlocked) {
    const resetAt = Math.max(
      clientBlocked ? client.resetAt : 0,
      instanceBlocked ? instance.resetAt : 0
    );
    return { allowed: false, retryAfterSeconds: retryAfterSeconds(resetAt, now) };
  }

  client.count += 1;
  instance.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitState(): void {
  buckets.clear();
}
