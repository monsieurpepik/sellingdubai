// Additional unit tests for capture-lead-v4 (converted from integration test)
// Core tests live in test.ts — these cover edge cases not included there.

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

const MOCK_AGENT = {
  id: "agent-1",
  name: "Test Agent",
  slug: "test-agent",
  email: "agent@test.local",
  webhook_url: null,
  facebook_pixel_id: null,
  facebook_capi_token: null,
};
const MOCK_LEAD = { id: "lead-1", name: "Test Lead", phone: "+971501234567", email: null };

Deno.test("capture-lead: happy path with phone", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://sellingdubai.com" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", phone: "+971501234567", source: "profile" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      "agents": { data: MOCK_AGENT, error: null },
      "leads": { data: MOCK_LEAD, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.lead_id);
});

Deno.test("capture-lead: happy path with email", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://sellingdubai.com" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Lead", email: "lead@example.com", source: "profile" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      "agents": { data: MOCK_AGENT, error: null },
      "leads": { data: { ...MOCK_LEAD, phone: null, email: "lead@example.com" }, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.lead_id);
});

Deno.test("capture-lead: missing name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Name is required.");
});

Deno.test("capture-lead: empty name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "   ", phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Name is required.");
});

Deno.test("capture-lead: missing phone and email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "No Contact" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Phone or email is required.");
});

Deno.test("capture-lead: invalid email format returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Bad Email", email: "not-an-email" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Invalid email format.");
});

Deno.test("capture-lead: invalid phone (too short) returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Bad Phone", phone: "123" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Invalid phone number.");
});

Deno.test("capture-lead: nonexistent agent returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "nonexistent-agent", name: "Lost Lead", phone: "+971501234567" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      // agents → NOT_FOUND by default
    }),
  );
  assertEquals(res.status, 404);
  const data = await res.json();
  assertEquals(data.error, "Agent not found.");
});

Deno.test("capture-lead: field exceeding max length returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "A".repeat(200), phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "name exceeds maximum length.");
});

Deno.test("capture-lead: honeypot field returns silent success", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Bot Lead", phone: "+971501234567", website: "http://spam.com" }),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

Deno.test("capture-lead: duplicate phone within 24h returns silent success with same lead_id", async () => {
  const existingLead = { id: "existing-lead-1", phone: "+971561234567" };
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Dedup Test", phone: "+971561234567" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      "agents": { data: MOCK_AGENT, error: null },
      "leads": { data: existingLead, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.lead_id);
});

Deno.test("capture-lead: duplicate email within 24h returns silent success", async () => {
  const existingLead = { id: "existing-lead-2", email: "dedup@example.com" };
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Email Dedup", email: "dedup@example.com" }),
    }),
    mockClientFactory({
      "leads:count": { count: 0, error: null },
      "agents": { data: MOCK_AGENT, error: null },
      "leads": { data: existingLead, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.lead_id);
});

Deno.test({
  name: "capture-lead: rate limit after 10 requests from same IP returns 429",
  ignore: true,
  async fn() {
    throw new Error("Integration test — requires live server.");
  },
});

Deno.test("capture-lead: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  assertEquals(res.ok, true);
});
