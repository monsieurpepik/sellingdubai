import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("post-buyer-request");

Deno.test("post-buyer-request: missing Authorization returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ property_type: "apartment" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("post-buyer-request: invalid Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ property_type: "apartment" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("post-buyer-request: unused magic link returns 401", async () => {
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ property_type: "apartment" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
    await sb.from("magic_links").delete().eq("token", token);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("post-buyer-request: non-premium agent returns 403 with upgrade_required", async () => {
  // Seeded agents are not premium, so this tests the premium gate
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${link.token}`,
      },
      body: JSON.stringify({ property_type: "apartment" }),
    });
    if (res.status !== 403) throw new Error(`Expected 403 for non-premium agent, got ${res.status}`);
    const data = await res.json();
    if (data.upgrade_required !== true) throw new Error(`Expected upgrade_required:true, got: ${JSON.stringify(data)}`);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("post-buyer-request: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
