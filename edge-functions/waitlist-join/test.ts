import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");

Deno.test("waitlist-join: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("waitlist-join: missing name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const body = await res.json();
  if (typeof body.error !== "string") throw new Error(`Expected error string, got: ${JSON.stringify(body)}`);
});

Deno.test("waitlist-join: name too short returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A", email: "test@example.com" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const body = await res.json();
  if (typeof body.error !== "string") throw new Error(`Expected error string, got: ${JSON.stringify(body)}`);
});

Deno.test("waitlist-join: invalid email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", email: "not-an-email" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const body = await res.json();
  if (typeof body.error !== "string") throw new Error(`Expected error string, got: ${JSON.stringify(body)}`);
});

Deno.test("waitlist-join: valid submission returns success", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice Test", email: "alice@example.com" }),
    }),
    mockClientFactory({
      "waitlist:count": { count: 42, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.success !== true) throw new Error(`Expected success:true, got: ${JSON.stringify(body)}`);
  if (body.duplicate !== false) throw new Error(`Expected duplicate:false, got: ${JSON.stringify(body)}`);
  if (body.count !== 42) throw new Error(`Expected count:42, got: ${JSON.stringify(body)}`);
});

Deno.test("waitlist-join: duplicate email returns duplicate flag", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice Dup", email: "alice-dup@example.com" }),
    }),
    mockClientFactory({
      "waitlist": { data: null, error: { code: "23505", message: "duplicate key" } },
      "waitlist:count": { count: 10, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.success !== true) throw new Error(`Expected success:true, got: ${JSON.stringify(body)}`);
  if (body.duplicate !== true) throw new Error(`Expected duplicate:true, got: ${JSON.stringify(body)}`);
});
