import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("cobroke-request");

Deno.test("cobroke-request: missing Authorization returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ property_id: crypto.randomUUID() }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("cobroke-request: invalid Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ property_id: crypto.randomUUID() }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("cobroke-request: unused magic link returns 401", async () => {
  const agent = await seedAgent();
  try {
    // Seed a link WITHOUT used_at (unused)
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = crypto.randomUUID();
    await sb.from("magic_links").insert({
      agent_id: agent.id,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      used_at: null,
    });
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
    await sb.from("magic_links").delete().eq("token", token);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("cobroke-request: missing property_id returns 400", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("cobroke-request: non-existent property_id returns 404", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    });
    if (res.status !== 404) throw new Error(`Expected 404 for unknown property, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("cobroke-request: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
