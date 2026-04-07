import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("cobroke-listings: missing Authorization returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("cobroke-listings: invalid Bearer token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "GET",
      headers: { "Authorization": `Bearer ${crypto.randomUUID()}` },
    }),
    mockClientFactory({
      // magic_links not provided → defaults to NOT_FOUND → link is null → 401
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("cobroke-listings: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "GET",
      headers: { "Authorization": "Bearer unused-token" },
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("cobroke-listings: valid token returns listings array", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "GET",
      headers: { "Authorization": "Bearer valid-token" },
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: new Date().toISOString() }, error: null },
      "properties": { data: [], error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.listings)) throw new Error(`Expected listings array, got: ${JSON.stringify(data)}`);
  if (typeof data.count !== "number") throw new Error(`Expected count number, got: ${JSON.stringify(data)}`);
});

Deno.test("cobroke-listings: POST returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});
