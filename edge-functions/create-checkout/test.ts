import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

// Test 1: no auth token returns 400
Deno.test("create-checkout: missing token returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", interval: "monthly" }),
    }),
    mockClientFactory(),
  );
  const data = await res.json();
  if (res.status !== 400) {
    throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
  }
});

// Test 2: invalid plan returns 400
Deno.test("create-checkout: invalid plan returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-token", plan: "enterprise", interval: "monthly" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

// Test 3: invalid interval returns 400
Deno.test("create-checkout: invalid interval returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-token", plan: "pro", interval: "weekly" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

// Test 4: invalid/expired magic link token returns 401
Deno.test("create-checkout: invalid magic link token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token", plan: "pro", interval: "monthly" }),
    }),
    mockClientFactory({
      // magic_links not provided → defaults to NOT_FOUND
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

// Test 5: unused magic link (no used_at) returns 401
Deno.test("create-checkout: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "unused-token", plan: "pro", interval: "monthly" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

// Test 6: agent already on requested plan returns 409
Deno.test("create-checkout: agent already on requested plan returns 409", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", plan: "pro", interval: "monthly" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: new Date().toISOString() }, error: null },
      "agents": { data: { id: "agent-1", email: "agent@test.local", name: "Test Agent", stripe_customer_id: null, tier: "pro" }, error: null },
    }),
  );
  const data = await res.json();
  if (res.status !== 409) {
    throw new Error(`Expected 409, got ${res.status}: ${JSON.stringify(data)}`);
  }
  if (data.error !== "already_on_plan") {
    throw new Error(`Expected error "already_on_plan", got: ${JSON.stringify(data.error)}`);
  }
});

// Test 7: missing Stripe price ID env var returns 500
Deno.test("create-checkout: missing Stripe price ID returns 500", async () => {
  // Ensure price env vars are NOT set
  Deno.env.delete("STRIPE_PRICE_PRO_MONTHLY");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", plan: "pro", interval: "monthly" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: new Date().toISOString() }, error: null },
      "agents": { data: { id: "agent-1", email: "agent@test.local", name: "Test Agent", stripe_customer_id: "cus_existing", tier: "free" }, error: null },
    }),
  );
  if (res.status !== 500) {
    const body = await res.text();
    throw new Error(`Expected 500, got ${res.status}: ${body}`);
  }
});

// Test 8: valid free agent with Stripe key — skip if no STRIPE_SECRET_KEY
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
Deno.test(
  {
    name: "create-checkout: valid free agent returns Stripe checkout URL",
    ignore: !stripeKey,
  },
  async () => {
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "valid-token", plan: "pro", interval: "monthly" }),
      }),
      mockClientFactory({
        "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: new Date().toISOString() }, error: null },
        "agents": { data: { id: "agent-1", email: "agent@test.local", name: "Test Agent", stripe_customer_id: null, tier: "free" }, error: null },
      }),
    );
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (!data.url?.startsWith("https://checkout.stripe.com")) {
      throw new Error(`Expected Stripe checkout URL, got: ${JSON.stringify(data.url)}`);
    }
  },
);
