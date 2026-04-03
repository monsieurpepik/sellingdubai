import { cleanupAgent, fnUrl, seedAgent } from "../_shared/test-helpers.ts";

const URL = fnUrl("track-referral");

Deno.test("track-referral: missing new_agent_id returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referral_code: "some-code" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("track-referral: missing referral_code returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_agent_id: crypto.randomUUID() }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("track-referral: invalid referral_code returns 404", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        new_agent_id: agent.id,
        referral_code: `nonexistent-${crypto.randomUUID().slice(0, 8)}`,
      }),
    });
    if (res.status !== 404) throw new Error(`Expected 404 for unknown code, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("track-referral: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
