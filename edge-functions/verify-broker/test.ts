import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("verify-broker: missing broker_number returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("verify-broker: string broker_number returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker_number: "not-a-number" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("verify-broker: unknown BRN returns 404 with verified:false", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker_number: 9999999 }),
    }),
    mockClientFactory(), // dld_brokers defaults to NOT_FOUND
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (data.verified !== false) {
    throw new Error(`Expected verified:false, got: ${JSON.stringify(data)}`);
  }
});

Deno.test("verify-broker: test mode BRN=0 returns verified broker when ENABLE_TEST_MODE=true", async () => {
  Deno.env.set("ENABLE_TEST_MODE", "true");
  try {
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker_number: 0 }),
      }),
      mockClientFactory(),
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.verified !== true) {
      throw new Error(`Test mode: expected verified:true, got: ${JSON.stringify(data)}`);
    }
    if (!data.broker || data.broker.broker_number !== 0) {
      throw new Error(`Test mode: expected broker.broker_number=0, got: ${JSON.stringify(data)}`);
    }
  } finally {
    Deno.env.delete("ENABLE_TEST_MODE");
  }
});

Deno.test("verify-broker: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("verify-broker: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
});

Deno.test("verify-broker: valid BRN returns verified broker", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker_number: 12345 }),
    }),
    mockClientFactory({
      "dld_brokers": {
        data: {
          broker_number: 12345,
          broker_name_en: "John Doe",
          broker_name_ar: "جون دو",
          license_start_date: "2020-01-01",
          license_end_date: "2099-12-31",
          real_estate_number: "AGENCY-001",
        },
        error: null,
      },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.verified !== true) throw new Error(`Expected verified:true, got: ${JSON.stringify(data)}`);
  if (data.license_active !== true) throw new Error(`Expected license_active:true`);
});
