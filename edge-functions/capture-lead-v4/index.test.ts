// ============================================================
// TESTS — capture-lead-v4
// Run: deno test edge-functions/capture-lead-v4/index.test.ts --allow-env --allow-net
// ============================================================

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("TEST_SUPABASE_URL") || "https://pjyorgedaxevxophpfib.supabase.co";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/capture-lead`;
const ORIGIN = "https://sellingdubai.ae";

// Known verified agent slug for testing (won't actually email — RESEND_KEY controls that)
const TEST_AGENT_SLUG = Deno.env.get("TEST_AGENT_SLUG") || "boban-pepic";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

async function postLead(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
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

// Helper: skip test gracefully if IP is rate-limited from prior runs
function skipIfRateLimited(result: { status: number }): boolean {
  if (result.status === 429) {
    console.log("  ⚠ Skipped — IP rate-limited (10/hr). Wait 1 hour or test from a different IP.");
    return true;
  }
  return false;
}

// ============================================================
// HAPPY PATH
// ============================================================

Deno.test("capture-lead: happy path with phone", async () => {
  const uniquePhone = `+97150${Date.now().toString().slice(-7)}`;
  const result = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Test Lead Happy",
    phone: uniquePhone,
    source: "profile",
  });
  if (skipIfRateLimited(result)) return;

  assertEquals(result.status, 200);
  assertEquals(result.data.success, true);
  assertExists(result.data.lead_id);
});

Deno.test("capture-lead: happy path with email", async () => {
  const uniqueEmail = `testlead+${Date.now()}@example.com`;
  const result = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Test Lead Email",
    email: uniqueEmail,
    source: "profile",
  });
  if (skipIfRateLimited(result)) return;

  assertEquals(result.status, 200);
  assertEquals(result.data.success, true);
  assertExists(result.data.lead_id);
});

Deno.test("capture-lead: happy path with all fields", async () => {
  const uniquePhone = `+97155${Date.now().toString().slice(-7)}`;
  const result = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Full Lead Test",
    phone: uniquePhone,
    email: `full+${Date.now()}@example.com`,
    budget_range: "AED 1M - 2M",
    property_type: "Apartment",
    preferred_area: "Dubai Marina",
    message: "I'm interested in a 2BR with sea view.",
    source: "full_profile",
    utm_source: "instagram",
    utm_medium: "social",
    utm_campaign: "spring_2026",
    device_type: "mobile",
  });
  if (skipIfRateLimited(result)) return;

  assertEquals(result.status, 200);
  assertEquals(result.data.success, true);
  assertExists(result.data.lead_id);
});

// ============================================================
// MISSING REQUIRED FIELDS
// ============================================================

Deno.test("capture-lead: missing name returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    phone: "+971501234567",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "Name is required.");
});

Deno.test("capture-lead: empty name returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "   ",
    phone: "+971501234567",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "Name is required.");
});

Deno.test("capture-lead: missing phone and email returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "No Contact Info",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "Phone or email is required.");
});

Deno.test("capture-lead: invalid email format returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Bad Email",
    email: "not-an-email",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "Invalid email format.");
});

Deno.test("capture-lead: invalid phone (too short) returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Bad Phone",
    phone: "123",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "Invalid phone number.");
});

Deno.test("capture-lead: nonexistent agent returns 404", async () => {
  const result = await postLead({
    agent_slug: "this-agent-does-not-exist-" + Date.now(),
    name: "Lost Lead",
    phone: "+971501234567",
  });
  if (skipIfRateLimited(result)) return;

  assertEquals(result.status, 404);
  assertEquals(result.data.error, "Agent not found.");
});

Deno.test("capture-lead: field exceeding max length returns 400", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "A".repeat(200), // max 150
    phone: "+971501234567",
  });

  assertEquals(status, 400);
  assertEquals(data.error, "name exceeds maximum length.");
});

// ============================================================
// HONEYPOT
// ============================================================

Deno.test("capture-lead: honeypot field returns silent success", async () => {
  const { status, data } = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Bot Lead",
    phone: "+971501234567",
    website: "http://spam.com", // honeypot
  });

  // Bots get a fake 200 success
  assertEquals(status, 200);
  assertEquals(data.success, true);
});

// ============================================================
// DUPLICATE DETECTION
// ============================================================

Deno.test("capture-lead: duplicate phone within 24h returns silent success", async () => {
  const uniquePhone = `+97156${Date.now().toString().slice(-7)}`;

  // First submission
  const first = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Dedup Test",
    phone: uniquePhone,
  });

  // If rate-limited from previous test runs, skip gracefully
  if (first.status === 429) {
    console.log("  ⚠ Skipped — IP rate-limited from prior test run");
    return;
  }

  assertEquals(first.status, 200);
  assertEquals(first.data.success, true);
  const firstId = first.data.lead_id;

  // Second submission — same phone, same agent
  const second = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Dedup Test Again",
    phone: uniquePhone,
  });

  // Should return 200 with the ORIGINAL lead_id (deduped)
  assertEquals(second.status, 200);
  assertEquals(second.data.success, true);
  assertEquals(second.data.lead_id, firstId);
});

Deno.test("capture-lead: duplicate email within 24h returns silent success", async () => {
  const uniqueEmail = `dedup+${Date.now()}@example.com`;

  const first = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Email Dedup",
    email: uniqueEmail,
  });

  // If rate-limited from previous test runs, skip gracefully
  if (first.status === 429) {
    console.log("  ⚠ Skipped — IP rate-limited from prior test run");
    return;
  }

  assertEquals(first.status, 200);
  const firstId = first.data.lead_id;

  const second = await postLead({
    agent_slug: TEST_AGENT_SLUG,
    name: "Email Dedup Again",
    email: uniqueEmail,
  });

  assertEquals(second.status, 200);
  assertEquals(second.data.success, true);
  assertEquals(second.data.lead_id, firstId);
});

// ============================================================
// RATE LIMITING
// ============================================================

Deno.test({
  name: "capture-lead: rate limit after 10 requests from same IP returns 429",
  // This test is slow and creates real leads — skip by default
  // Remove `ignore: true` to run manually
  ignore: true,
  async fn() {
    // Send 11 requests rapidly — the 11th should be rate-limited
    // Note: requires all requests to come from the same IP (same machine)
    const results = [];
    for (let i = 0; i < 11; i++) {
      const uniquePhone = `+97158${Date.now().toString().slice(-7)}${i}`;
      const result = await postLead({
        agent_slug: TEST_AGENT_SLUG,
        name: `Rate Limit Test ${i}`,
        phone: uniquePhone,
      });
      results.push(result);
    }

    // At least one of the later requests should be 429
    const rateLimited = results.filter(r => r.status === 429);
    assertEquals(rateLimited.length > 0, true, "Expected at least one 429 response");
    assertEquals(rateLimited[0].data.error, "Too many requests. Please try again later.");
  },
});

// ============================================================
// OPTIONS (CORS preflight)
// ============================================================

Deno.test("capture-lead: OPTIONS returns CORS headers", async () => {
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
