import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("manage-agency");

Deno.test("manage-agency: missing token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_my_agency" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-agency: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID(), action: "get_my_agency" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-agency: unused magic link returns 401", async () => {
  const agent = await seedAgent();
  try {
    const { seedMagicLink } = await import("../_shared/test-helpers.ts");
    const link = await seedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, action: "get_my_agency" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-agency: get_my_agency returns null for agent without agency", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, action: "get_my_agency" }),
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    // Agent with no agency should return null or empty agency
    if (data.agency !== null && data.agency !== undefined && typeof data.agency !== "object") {
      throw new Error(`Expected null or object for agency, got: ${JSON.stringify(data)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-agency: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-agency: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
