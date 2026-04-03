import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("manage-referral");

Deno.test("manage-referral: missing token returns 400/401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referral_id: crypto.randomUUID(), action: "accept" }),
  });
  if (res.status !== 400 && res.status !== 401) {
    throw new Error(`Expected 400/401, got ${res.status}`);
  }
  await res.body?.cancel();
});

Deno.test("manage-referral: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: crypto.randomUUID(),
      referral_id: crypto.randomUUID(),
      action: "accept",
    }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-referral: non-existent referral_id returns 404", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: link.token,
        referral_id: crypto.randomUUID(),
        action: "accept",
      }),
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-referral: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
