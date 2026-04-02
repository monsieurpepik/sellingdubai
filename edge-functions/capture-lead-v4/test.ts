import {
  cleanupAgent,
  fnUrl,
  seedAgent,
} from "../_shared/test-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = fnUrl("capture-lead-v4");

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("capture-lead-v4: valid lead payload stores and returns 200", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_slug: agent.slug,
        name: "Test Lead",
        phone: "+971501111111",
        source: "test",
      }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("capture-lead-v4: missing name returns 400", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_slug: agent.slug,
        phone: "+971501111111",
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("capture-lead-v4: missing phone and email returns 400", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_slug: agent.slug,
        name: "Test Lead",
      }),
    });
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("capture-lead-v4: 10th+ request from same IP within rate window returns 429", async () => {
  const agent = await seedAgent();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Pre-seed 10 leads with the ip_hash the function will compute for 127.0.0.1
  const salt = Deno.env.get("RATE_LIMIT_SALT") ?? "local-salt-replace-in-prod";
  const ipHash = await sha256Hex("127.0.0.1" + salt);
  const now = new Date().toISOString();
  const seedRows = Array.from({ length: 10 }, (_, i) => ({
    agent_id: agent.id,
    name: `Seed Lead ${i}`,
    phone: "+971500000000",
    ip_hash: ipHash,
    created_at: now,
    source: "test",
  }));
  const { error } = await supabase.from("leads").insert(seedRows);
  if (error) throw new Error(`Failed to seed leads: ${error.message}`);

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_slug: agent.slug,
        name: "Rate Limited Lead",
        phone: "+971502222222",
        source: "test",
      }),
    });
    if (res.status !== 429) {
      throw new Error(`Expected 429, got ${res.status}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});
