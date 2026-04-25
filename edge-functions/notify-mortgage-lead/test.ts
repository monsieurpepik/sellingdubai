import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("PLATFORM_OPS_EMAIL", "ops@sellingdubai.com");
Deno.env.set("RESEND_API_KEY", "");

Deno.test("notify-mortgage-lead: missing Authorization returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id: crypto.randomUUID() }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("notify-mortgage-lead: wrong Bearer token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong-token",
      },
      body: JSON.stringify({ application_id: crypto.randomUUID() }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("notify-mortgage-lead: missing application_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-service-key",
      },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("notify-mortgage-lead: unknown application_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-service-key",
      },
      body: JSON.stringify({ application_id: "non-existent-id" }),
    }),
    mockClientFactory(), // mortgage_applications defaults to NOT_FOUND
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("notify-mortgage-lead: unknown agent_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-service-key",
      },
      body: JSON.stringify({ application_id: "app-1" }),
    }),
    mockClientFactory({
      "mortgage_applications": {
        data: { id: "app-1", agent_id: "agent-1", buyer_name: "Test Buyer", buyer_phone: "+971500000000" },
        error: null,
      },
      // agents defaults to NOT_FOUND
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("notify-mortgage-lead: valid request returns 200", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-service-key",
      },
      body: JSON.stringify({ application_id: "app-1" }),
    }),
    mockClientFactory({
      "mortgage_applications": {
        data: {
          id: "app-1",
          agent_id: "agent-1",
          buyer_name: "Test Buyer",
          buyer_phone: "+971500000000",
          buyer_email: "buyer@example.com",
          property_title: "Test Property",
          max_loan_amount: 1000000,
        },
        error: null,
      },
      "agents": {
        data: { id: "agent-1", name: "Test Agent", slug: "test-agent", email: "agent@example.com" },
        error: null,
      },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
});
