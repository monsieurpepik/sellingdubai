import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("manage-cobroke");

Deno.test("manage-cobroke: missing Authorization returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-cobroke: invalid Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-cobroke: missing deal_id returns 400", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-cobroke: invalid action returns 400", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "invalid_action" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-cobroke: non-existent deal_id returns 404", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
    });
    if (res.status !== 404) throw new Error(`Expected 404 for unknown deal, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-cobroke: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
