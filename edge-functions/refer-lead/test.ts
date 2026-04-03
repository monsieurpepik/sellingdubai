import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("refer-lead");

Deno.test("refer-lead: missing token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_slug: "someone", lead_name: "Test Lead" }),
  });
  if (res.status !== 400 && res.status !== 401) {
    throw new Error(`Expected 400/401, got ${res.status}`);
  }
  await res.body?.cancel();
});

Deno.test("refer-lead: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: crypto.randomUUID(),
      recipient_slug: "someone",
      lead_name: "Test Lead",
      lead_phone: "+971501234567",
    }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("refer-lead: referral to non-existent agent returns 404", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: link.token,
        recipient_slug: `nonexistent-${crypto.randomUUID().slice(0, 8)}`,
        lead_name: "Test Lead",
        lead_phone: "+971501234567",
      }),
    });
    if (res.status !== 404) throw new Error(`Expected 404 for unknown agent, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("refer-lead: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
