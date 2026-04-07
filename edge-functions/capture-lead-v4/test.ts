import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

Deno.test("capture-lead-v4: missing name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", phone: "+971501111111" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-lead-v4: missing phone and email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-lead-v4: invalid email format returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", email: "not-an-email" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-lead-v4: invalid phone number returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", phone: "123" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-lead-v4: honeypot field returns 200 silently", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Bot", phone: "+971501111111", website: "http://spam.com" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200 for honeypot, got ${res.status}`);
});

Deno.test("capture-lead-v4: rate limited returns 429 when count >= 10", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", phone: "+971501111111" }),
    }),
    mockClientFactory({
      "leads:count": { count: 10, error: null },
    }),
  );
  if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
});

Deno.test("capture-lead-v4: agent not found returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "nonexistent-agent", name: "Test Lead", phone: "+971501111111" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      // agents not provided → defaults to NOT_FOUND with code PGRST116
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("capture-lead-v4: valid lead payload returns 200", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", phone: "+971501111111", source: "test" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      "agents": { data: { id: "agent-1", name: "Test Agent", slug: "test-agent", email: "agent@test.local", webhook_url: null, facebook_pixel_id: null, facebook_capi_token: null }, error: null },
      "leads": { data: { id: "lead-1", name: "Test Lead", phone: "+971501111111", email: null, budget_range: null, property_type: null, preferred_area: null, message: null, source: "test", utm_source: null, utm_medium: null, utm_campaign: null, device_type: null, created_at: new Date().toISOString() }, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
});

Deno.test("capture-lead-v4: OPTIONS returns 200", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});
