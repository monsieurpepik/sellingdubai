import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("cobroke-request: missing Authorization returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("cobroke-request: invalid Bearer token returns 401", async () => {
  // Default mock: magic_links single() → NOT_FOUND (no data)
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("cobroke-request: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("cobroke-request: missing property_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({}),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals:count": { count: 0, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("cobroke-request: non-existent property_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({ property_id: crypto.randomUUID() }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals:count": { count: 0, error: null },
      // properties single() → NOT_FOUND (default)
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404 for unknown property, got ${res.status}`);
});

Deno.test("cobroke-request: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});
