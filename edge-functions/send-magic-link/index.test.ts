// ============================================================
// TESTS — send-magic-link
// Run: deno test edge-functions/send-magic-link/index.test.ts --allow-env --allow-net
// ============================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("TEST_SUPABASE_URL") || "https://pjyorgedaxevxophpfib.supabase.co";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/send-magic-link`;
const ORIGIN = "https://sellingdubai.ae";

// A known registered agent email for testing
const TEST_AGENT_EMAIL = Deno.env.get("TEST_AGENT_EMAIL") || "";

async function postMagicLink(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": ORIGIN,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ============================================================
// HAPPY PATH
// ============================================================

Deno.test("send-magic-link: valid email returns success", async () => {
  // Skip if no test email configured
  if (!TEST_AGENT_EMAIL) {
    console.log("  ⚠ Skipped — set TEST_AGENT_EMAIL env var to run");
    return;
  }

  const { status, data } = await postMagicLink({ email: TEST_AGENT_EMAIL });

  assertEquals(status, 200);
  assertEquals(data.success, true);
  assertEquals(data.message, "If this email is registered, you'll receive a magic link.");
});

Deno.test("send-magic-link: unregistered email returns same success (no enumeration)", async () => {
  const { status, data } = await postMagicLink({
    email: `nonexistent+${Date.now()}@example.com`,
  });

  // Must return 200 with same message — prevents email enumeration
  assertEquals(status, 200);
  assertEquals(data.success, true);
  assertEquals(data.message, "If this email is registered, you'll receive a magic link.");
});

// ============================================================
// MISSING / INVALID FIELDS
// ============================================================

Deno.test("send-magic-link: missing email returns 400", async () => {
  const { status, data } = await postMagicLink({});

  assertEquals(status, 400);
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: empty email returns 400", async () => {
  const { status, data } = await postMagicLink({ email: "" });

  assertEquals(status, 400);
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: null email returns 400", async () => {
  const { status, data } = await postMagicLink({ email: null });

  assertEquals(status, 400);
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: numeric email returns 400", async () => {
  const { status, data } = await postMagicLink({ email: 12345 });

  assertEquals(status, 400);
  assertEquals(data.error, "Email is required.");
});

// ============================================================
// RATE LIMITING
// ============================================================

Deno.test("send-magic-link: per-agent rate limit returns silent success after 3 requests", async () => {
  if (!TEST_AGENT_EMAIL) {
    console.log("  ⚠ Skipped — set TEST_AGENT_EMAIL env var to run");
    return;
  }

  // Send 4 rapid requests — the 4th should be silently rate-limited
  const results = [];
  for (let i = 0; i < 4; i++) {
    results.push(await postMagicLink({ email: TEST_AGENT_EMAIL }));
  }

  // All should return 200 (rate limit is silent — no enumeration leaks)
  for (const r of results) {
    assertEquals(r.status, 200);
    assertEquals(r.data.success, true);
  }

  // The function returns the same response whether rate-limited or not
  // This is intentional — prevents timing-based enumeration
});

// ============================================================
// OPTIONS (CORS preflight)
// ============================================================

Deno.test("send-magic-link: OPTIONS returns CORS headers", async () => {
  const res = await fetch(ENDPOINT, {
    method: "OPTIONS",
    headers: { "Origin": ORIGIN },
  });

  // Supabase returns 200 for OPTIONS, not 204
  assertEquals(res.ok, true);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  assertExists(allowOrigin);
  await res.body?.cancel();
});

// ============================================================
// MALFORMED REQUEST
// ============================================================

Deno.test("send-magic-link: invalid JSON returns 500", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": ORIGIN,
    },
    body: "not json",
  });

  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.error, "Internal server error.");
});
