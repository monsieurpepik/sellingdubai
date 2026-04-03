import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("cobroke-listings");

Deno.test("cobroke-listings: missing Authorization returns 401", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("cobroke-listings: invalid Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "GET",
    headers: { "Authorization": `Bearer ${crypto.randomUUID()}` },
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("cobroke-listings: unused magic link returns 401", async () => {
  const agent = await seedAgent();
  try {
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
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
    await sb.from("magic_links").delete().eq("token", token);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("cobroke-listings: valid token returns listings array", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "GET",
      headers: { "Authorization": `Bearer ${link.token}` },
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.listings)) throw new Error(`Expected listings array, got: ${JSON.stringify(data)}`);
    if (typeof data.count !== "number") throw new Error(`Expected count number, got: ${JSON.stringify(data)}`);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("cobroke-listings: POST returns 405", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
