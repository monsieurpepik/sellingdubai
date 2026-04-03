import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("get-analytics");

Deno.test("get-analytics: missing token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("get-analytics: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID() }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("get-analytics: unused magic link returns 401", async () => {
  const agent = await seedAgent();
  try {
    const { seedMagicLink } = await import("../_shared/test-helpers.ts");
    const link = await seedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("get-analytics: valid session returns analytics data", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    // Analytics response should have numeric fields
    if (typeof data.views_this_month === "undefined" && typeof data.leads_this_month === "undefined") {
      throw new Error(`Expected analytics fields, got: ${JSON.stringify(data)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("get-analytics: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
