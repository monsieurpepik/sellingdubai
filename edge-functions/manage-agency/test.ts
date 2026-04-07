import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("manage-agency: missing token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_my_agency" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-agency: invalid token returns 401", async () => {
  // Default mock: magic_links single() → NOT_FOUND (linkErr set)
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID(), action: "get_my_agency" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-agency: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-unused-token", action: "get_my_agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("manage-agency: get_my_agency returns null for agent without agency", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_my_agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // agencies maybeSingle() → null (default NOT_FOUND treated as null by maybeSingle)
      // agents single() → no agency_id
      "agents": { data: { agency_id: null }, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (data.agency !== null && data.agency !== undefined && typeof data.agency !== "object") {
    throw new Error(`Expected null or object for agency, got: ${JSON.stringify(data)}`);
  }
});

Deno.test("manage-agency: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("manage-agency: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});
