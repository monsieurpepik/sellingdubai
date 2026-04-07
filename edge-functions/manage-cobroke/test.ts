import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("manage-cobroke: missing Authorization returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-cobroke: invalid Bearer token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-cobroke: missing deal_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({ action: "accept" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("manage-cobroke: invalid action returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "invalid_action" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("manage-cobroke: non-existent deal_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({ deal_id: crypto.randomUUID(), action: "accept" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // co_broke_deals single() → NOT_FOUND (default)
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404 for unknown deal, got ${res.status}`);
});

Deno.test("manage-cobroke: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});
