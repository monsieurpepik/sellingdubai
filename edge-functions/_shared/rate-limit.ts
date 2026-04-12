// rate-limit.ts — Distributed rate limiting via Upstash Redis REST API.
//
// Uses a fixed-window counter: INCR key, set EXPIRE on first request.
// Requires env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Usage:
//   const { limited, count } = await rateLimitByKey("rate:magic-link:user@example.com", 3, 900);
//   if (limited) return json({ error: "Too many requests." }, 429);

interface RateLimitResult {
  /** true if the request should be blocked */
  limited: boolean;
  /** current request count in this window (0 if Upstash is unavailable) */
  count: number;
}

export async function rateLimitByKey(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  // If Upstash is not configured, fail open (don't block requests)
  if (!url || !token) return { limited: false, count: 0 };

  try {
    // Pipeline: INCR then EXPIRE (EXPIRE is a no-op after the first INCR in a window)
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds],
      ]),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return { limited: false, count: 0 };

    const data = (await res.json()) as [{ result: number }, { result: number }];
    const count = data[0]?.result ?? 0;
    return { limited: count > limit, count };
  } catch {
    // Network error or timeout — fail open
    return { limited: false, count: 0 };
  }
}
