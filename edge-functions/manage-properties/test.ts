import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

const FREE_AGENT = {
  tier: "free",
  stripe_subscription_status: null,
  stripe_current_period_end: null,
};

Deno.test("manage-properties: missing token returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("manage-properties: invalid token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID(), action: "list" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-properties: missing action returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "irrelevant" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("manage-properties: unused magic link (not activated) returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-unused-token", action: "list" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("manage-properties: list returns properties array for valid session", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "list" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents": { data: FREE_AGENT, error: null },
      "properties": { data: [], error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.properties)) {
    throw new Error(`Expected properties array, got: ${JSON.stringify(data)}`);
  }
});

Deno.test("manage-properties: add property with valid session returns property", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "valid-token",
        action: "add",
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
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents": { data: FREE_AGENT, error: null },
      "properties:count": { count: 0, error: null },
      // sort_order query (single) → NOT_FOUND → nextOrder = 0
      "properties": { data: { id: "prop-1", title: "Test Property", price: 1500000 }, error: null },
      "properties:write": { data: { id: "prop-1", title: "Test Property", price: 1500000 }, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.property) throw new Error(`Expected property, got: ${JSON.stringify(data)}`);
});

Deno.test("manage-properties: delete non-owned property returns 404", async () => {
  const propId = crypto.randomUUID();
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "valid-token",
        action: "delete",
        property: { id: propId },
      }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // properties single() for toDelete → NOT_FOUND (default, other agent's property)
      // properties delete → returns empty array (not owned by this agent)
      "properties:write": { data: [], error: null },
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404 for cross-agent delete, got ${res.status}`);
});

Deno.test("manage-properties: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("manage-properties: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
});
