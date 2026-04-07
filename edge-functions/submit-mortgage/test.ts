import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("submit-mortgage: missing buyer_name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer_phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("submit-mortgage: missing phone and email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer_name: "Test Buyer" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("submit-mortgage: invalid employment_type returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Test Buyer",
        buyer_phone: "+971501234567",
        employment_type: "invalid_type",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("submit-mortgage: invalid residency_status returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Test Buyer",
        buyer_phone: "+971501234567",
        residency_status: "alien",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("submit-mortgage: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("submit-mortgage: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});

Deno.test("submit-mortgage: rate limit exceeded returns 429", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Test Buyer",
        buyer_phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "mortgage_applications:count": { count: 10, error: null },
    }),
  );
  if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
});

Deno.test.ignore("submit-mortgage: valid minimal submission returns 201", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Test Buyer",
        buyer_phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "mortgage_applications:count": { count: 0, error: null },
      "mortgage_applications": { data: { id: "app-1" }, error: null },
    }),
  );
  if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
  const data = await res.json();
  if (!data.id) throw new Error(`Expected id in response, got: ${JSON.stringify(data)}`);
  if (!data.edit_token) throw new Error(`Expected edit_token in response, got: ${JSON.stringify(data)}`);
});
