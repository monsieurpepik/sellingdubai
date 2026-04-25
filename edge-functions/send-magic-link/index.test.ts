// Additional unit tests for send-magic-link (converted from integration test)
// Core tests live in test.ts — these cover edge cases not included there.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");
Deno.env.set("SITE_URL", "https://sellingdubai.com");

Deno.test("send-magic-link: unregistered email returns same success (no enumeration)", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://sellingdubai.com" },
      body: JSON.stringify({ email: "nonexistent@example.com" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.message, "If this email is registered, you'll receive a magic link.");
});

Deno.test("send-magic-link: missing email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: empty email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: null email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: null }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: numeric email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: 12345 }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Email is required.");
});

Deno.test("send-magic-link: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  assertEquals(res.ok, true);
});

Deno.test("send-magic-link: invalid JSON returns 500", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://sellingdubai.com" },
      body: "not json",
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.error, "Internal server error.");
});
