import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");
Deno.env.set("SITE_URL", "https://sellingdubai.com");

Deno.test("send-magic-link: missing email returns 400", async () => {
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

Deno.test("send-magic-link: non-string email returns 400", async () => {
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

Deno.test("send-magic-link: agent not found returns 200 (no enumeration)", async () => {
  // Default mock returns NOT_FOUND for agents → function returns success silently
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200 (no enumeration), got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got ${JSON.stringify(data)}`);
});

Deno.test("send-magic-link: rate limit exceeded returns 200 (silent)", async () => {
  // Agent found, but magic_links count >= 3 → silent success
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "agent@example.com" }),
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-1", name: "Test Agent", email: "agent@example.com", slug: "test-agent", verification_status: "verified" }, error: null },
      "magic_links:count": { count: 3, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200 (rate limit silent), got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got ${JSON.stringify(data)}`);
});

Deno.test("send-magic-link: insert failure returns 500", async () => {
  // Agent found, rate limit ok, but magic_links insert fails
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "agent@example.com" }),
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-1", name: "Test Agent", email: "agent@example.com", slug: "test-agent", verification_status: "verified" }, error: null },
      "magic_links:count": { count: 0, error: null },
      "magic_links:write": { data: null, error: { code: "23505", message: "Duplicate key" } },
    }),
  );
  if (res.status !== 500) throw new Error(`Expected 500, got ${res.status}`);
});

Deno.test("send-magic-link: valid agent, no RESEND_API_KEY returns 200", async () => {
  // RESEND_API_KEY is "" so email block is skipped entirely → 200
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "agent@example.com" }),
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-1", name: "Test Agent", email: "agent@example.com", slug: "test-agent", verification_status: "verified" }, error: null },
      "magic_links:count": { count: 0, error: null },
      "magic_links:write": { data: { id: "link-1" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got ${JSON.stringify(data)}`);
});

Deno.test("send-magic-link: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`OPTIONS failed with ${res.status}`);
});

// Actual email send requires a real RESEND_API_KEY
Deno.test.ignore("send-magic-link: sends email via Resend (requires live RESEND_API_KEY)", async () => {
  throw new Error("Requires live RESEND_API_KEY.");
});
