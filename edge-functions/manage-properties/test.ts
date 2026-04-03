import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = fnUrl("manage-properties");

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function cleanupProperties(agentId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("properties").delete().eq("agent_id", agentId);
}

Deno.test("manage-properties: missing token returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-properties: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID(), action: "list" }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-properties: missing action returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "irrelevant" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-properties: unused magic link (not activated) returns 401", async () => {
  const agent = await seedAgent();
  try {
    // seedMagicLink returns a link with used_at: null (not activated)
    const { seedMagicLink } = await import("../_shared/test-helpers.ts");
    const link = await seedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, action: "list" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-properties: list returns properties array for valid session", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, action: "list" }),
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.properties)) {
      throw new Error(`Expected properties array, got: ${JSON.stringify(data)}`);
    }
  } finally {
    await cleanupProperties(agent.id as string);
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-properties: create property with valid session returns property", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: link.token,
        action: "create",
        property: {
          title: "Test Property",
          price: 1500000,
          location: "Dubai Marina",
          bedrooms: 2,
          area_sqft: 1200,
          property_type: "apartment",
          status: "for_sale",
        },
      }),
    });
    if (res.status !== 201 && res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200/201, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (!data.property?.id) throw new Error(`Expected property.id, got: ${JSON.stringify(data)}`);
  } finally {
    await cleanupProperties(agent.id as string);
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("manage-properties: delete non-owned property returns 404", async () => {
  const agent = await seedAgent();
  const other = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);

    // Create a property owned by `other`
    const supabase = getSupabase();
    const { data: prop } = await supabase
      .from("properties")
      .insert({
        agent_id: other.id,
        title: "Other Property",
        price: 1000000,
        location: "JBR",
        property_type: "apartment",
        status: "for_sale",
      })
      .select("id")
      .single();

    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: link.token,
        action: "delete",
        property: { id: prop!.id },
      }),
    });
    // Must not allow cross-agent delete — expect 404 (not found for this agent)
    if (res.status !== 404) throw new Error(`Expected 404 for cross-agent delete, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupProperties(agent.id as string);
    await cleanupProperties(other.id as string);
    await cleanupAgent(agent.id as string);
    await cleanupAgent(other.id as string);
  }
});

Deno.test("manage-properties: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("manage-properties: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
  await res.body?.cancel();
});
