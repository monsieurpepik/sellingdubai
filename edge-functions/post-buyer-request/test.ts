import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: "2024-01-01T00:00:00Z",
};

const PREMIUM_AGENT = {
  id: "agent-1",
  name: "Test Agent",
  slug: "test-agent",
  email: "agent@example.com",
  agency_name: "Test Agency",
  dld_verified: false,
  dld_total_deals: 0,
  tier: "premium",
  subscription_status: "active",
};

const FREE_AGENT = {
  ...PREMIUM_AGENT,
  tier: "free",
  subscription_status: null,
};

Deno.test("post-buyer-request: missing Authorization returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_type: "apartment" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("post-buyer-request: invalid Bearer token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer invalid-token`,
      },
      body: JSON.stringify({ property_type: "apartment" }),
    }),
    mockClientFactory(), // magic_links defaults to NOT_FOUND
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("post-buyer-request: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ property_type: "apartment" }),
    }),
    mockClientFactory({
      "magic_links": {
        data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null },
        error: null,
      },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("post-buyer-request: non-premium agent returns 403 with upgrade_required", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ property_type: "apartment" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents": { data: FREE_AGENT, error: null },
    }),
  );
  if (res.status !== 403) throw new Error(`Expected 403 for non-premium agent, got ${res.status}`);
  const data = await res.json();
  if (data.upgrade_required !== true) throw new Error(`Expected upgrade_required:true, got: ${JSON.stringify(data)}`);
});

Deno.test("post-buyer-request: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("post-buyer-request: no criteria returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({}),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents": { data: PREMIUM_AGENT, error: null },
      "buyer_requests:count": { count: 0, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("post-buyer-request: valid premium request returns 200", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ property_type: "apartment", budget_max: 2000000 }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents": { data: PREMIUM_AGENT, error: null },
      "buyer_requests:count": { count: 0, error: null },
      "buyer_requests": { data: { id: "req-1" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Expected ok:true, got: ${JSON.stringify(data)}`);
  if (data.request_id !== "req-1") throw new Error(`Expected request_id req-1, got: ${data.request_id}`);
});
