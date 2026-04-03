import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("update-lead-status");

Deno.test("update-lead-status: missing token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: "some-id", status: "contacted" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("update-lead-status: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID(), lead_id: "some-id", status: "contacted" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("update-lead-status: missing lead_id returns 400", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, status: "contacted" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("update-lead-status: invalid status returns 400", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, lead_id: "some-id", status: "purple" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("update-lead-status: non-existent lead returns 404", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: link.token,
        lead_id: crypto.randomUUID(),
        status: "contacted",
      }),
    });
    if (res.status !== 404) throw new Error(`Expected 404 for unknown lead, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("update-lead-status: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
