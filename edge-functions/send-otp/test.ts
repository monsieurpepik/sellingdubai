import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");
Deno.env.set("ENABLE_TEST_MODE", "false");

Deno.test("send-otp: missing email returns 400", async () => {
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

Deno.test("send-otp: empty string email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("send-otp: invalid email format returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("send-otp: numeric email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: 12345 }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("send-otp: email rate limit exceeded returns 429", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    }),
    mockClientFactory({
      "email_verification_codes:count": { count: 5, error: null },
    }),
  );
  if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
});

Deno.test("send-otp: no RESEND_API_KEY, under rate limit returns 200", async () => {
  // RESEND_API_KEY is "" so email block skipped entirely — no emailSent check fires
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    }),
    mockClientFactory({
      "email_verification_codes:count": { count: 0, error: null },
      "email_verification_codes:write": { data: { id: "code-1" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got ${JSON.stringify(data)}`);
});

Deno.test("send-otp: OTP insert error returns 500", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    }),
    mockClientFactory({
      "email_verification_codes:count": { count: 0, error: null },
      "email_verification_codes:write": { data: null, error: { code: "23505", message: "Insert failed" } },
    }),
  );
  if (res.status !== 500) throw new Error(`Expected 500, got ${res.status}`);
});

Deno.test("send-otp: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
});

// Actual email send requires a real RESEND_API_KEY
Deno.test.ignore("send-otp: sends email via Resend (requires live RESEND_API_KEY)", async () => {
  throw new Error("Requires live RESEND_API_KEY.");
});
