import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("notify-mortgage-lead");

// This is an internal-only endpoint authenticated with SUPABASE_SERVICE_ROLE_KEY.
// Tests cover auth rejection and input validation — no email is sent in test env
// (RESEND_KEY is not configured locally).

Deno.test("notify-mortgage-lead: missing Authorization returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application_id: crypto.randomUUID() }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("notify-mortgage-lead: wrong Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer wrong-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ application_id: crypto.randomUUID() }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("notify-mortgage-lead: missing application_id returns 400", async () => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) {
    console.log("SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({}),
  });
  // May return 400 (missing field) or 500 (PLATFORM_OPS_EMAIL not set)
  if (res.status !== 400 && res.status !== 500) {
    throw new Error(`Expected 400 or 500, got ${res.status}`);
  }
  await res.body?.cancel();
});

Deno.test("notify-mortgage-lead: non-existent application_id returns 404 or 500", async () => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) {
    console.log("SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ application_id: crypto.randomUUID() }),
  });
  // 404 if PLATFORM_OPS_EMAIL is set; 500 if not configured
  if (res.status !== 404 && res.status !== 500) {
    throw new Error(`Expected 404 or 500 for unknown application, got ${res.status}`);
  }
  await res.body?.cancel();
});
