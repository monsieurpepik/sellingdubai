import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/agency-stats", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function validSessionFactory(extra: Record<string, unknown> = {}) {
  return mockClientFactory({
    "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
    "agencies": { data: { id: "agency-1", name: "Test Agency", slug: "test-agency", logo_url: null }, error: null },
    ...extra,
  });
}

Deno.test("agency-stats: missing token returns 401", async () => {
  const res = await handler(makeReq({}), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("agency-stats: invalid token (not found) returns 401", async () => {
  // Default mock returns NOT_FOUND for single() — so magic_links lookup fails
  const res = await handler(makeReq({ token: "bad-token" }), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("agency-stats: unused magic link (no used_at) returns 401", async () => {
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: null }, error: null },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("agency-stats: agent without agency returns 403", async () => {
  // agencies not set → maybeSingle returns { data: null, error: null } → 403
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
    }),
  );
  assertEquals(res.status, 403);
});

Deno.test("agency-stats: valid session with agency but no members returns 200", async () => {
  const res = await handler(
    makeReq({ token: "valid-token" }),
    validSessionFactory(),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.agency.id, "agency-1");
  assertEquals(data.agents, []);
});

Deno.test("agency-stats: OPTIONS returns 200", async () => {
  const req = new Request("http://localhost/agency-stats", { method: "OPTIONS" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 200);
});

// --- breakdown=agents tests ---

Deno.test("agency-stats: without breakdown param, response has no agents_breakdown key", async () => {
  const res = await handler(
    makeReq({ token: "valid-token" }),
    validSessionFactory({
      "agents": {
        data: [{ id: "agent-2", name: "Alice", slug: "alice", photo_url: null }],
        error: null,
      },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  // Existing shape must be preserved
  assertExists(data.agency);
  assertExists(data.agents);
  assertExists(data.totals);
  assertEquals(data.agents_breakdown, undefined);
});

Deno.test("agency-stats: breakdown=agents returns agents_breakdown array with correct shape", async () => {
  const now = new Date();
  const leadCreatedAt = new Date(now.getFullYear(), now.getMonth(), 2).toISOString();
  const leadNotifiedAt = new Date(now.getFullYear(), now.getMonth(), 2, 2, 0, 0).toISOString(); // 2 hours later

  const res = await handler(
    makeReq({ token: "valid-token", breakdown: "agents" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      "agencies": { data: { id: "agency-1", name: "Test Agency", slug: "test-agency", logo_url: null }, error: null },
      "agents": {
        data: [{ id: "agent-2", name: "Bob", slug: "bob", photo_url: null }],
        error: null,
      },
      // leads for breakdown: one contacted, one converted
      "leads": {
        data: [
          { status: "contacted", created_at: leadCreatedAt, agent_notified_at: leadNotifiedAt },
          { status: "converted", created_at: leadCreatedAt, agent_notified_at: leadNotifiedAt },
          { status: "new", created_at: leadCreatedAt, agent_notified_at: null },
        ],
        error: null,
      },
      "properties:count": { count: 3, error: null },
      "co_broke_deals:count": { count: 1, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();

  // Existing keys still present
  assertExists(data.agency);
  assertExists(data.agents);
  assertExists(data.totals);

  // New breakdown key present
  assertExists(data.agents_breakdown);
  assertEquals(Array.isArray(data.agents_breakdown), true);
  assertEquals(data.agents_breakdown.length, 1);

  const bd = data.agents_breakdown[0];
  assertEquals(bd.agent_id, "agent-2");
  assertEquals(bd.name, "Bob");
  assertEquals(typeof bd.leads_received, "number");
  assertEquals(typeof bd.leads_contacted, "number");
  assertEquals(typeof bd.leads_converted, "number");
  // response_time_median_hours: number or null
  assertEquals(
    bd.response_time_median_hours === null || typeof bd.response_time_median_hours === "number",
    true,
  );
  assertEquals(typeof bd.active_listings, "number");
  assertEquals(typeof bd.cobrokes_sent, "number");
  assertEquals(typeof bd.cobrokes_received, "number");

  // Verify counts from mock data
  assertEquals(bd.leads_received, 3);   // all 3 leads
  assertEquals(bd.leads_contacted, 2);  // contacted + converted
  assertEquals(bd.leads_converted, 1);  // only converted
});

Deno.test("agency-stats: breakdown=agents with no notified leads gives null response_time", async () => {
  const now = new Date();
  const leadCreatedAt = new Date(now.getFullYear(), now.getMonth(), 3).toISOString();

  const res = await handler(
    makeReq({ token: "valid-token", breakdown: "agents" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      "agencies": { data: { id: "agency-1", name: "Test Agency", slug: "test-agency", logo_url: null }, error: null },
      "agents": {
        data: [{ id: "agent-3", name: "Carol", slug: "carol", photo_url: null }],
        error: null,
      },
      "leads": {
        data: [
          { status: "new", created_at: leadCreatedAt, agent_notified_at: null },
        ],
        error: null,
      },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertExists(data.agents_breakdown);
  assertEquals(data.agents_breakdown[0].response_time_median_hours, null);
});

Deno.test("agency-stats: breakdown=agents with empty members returns empty agents_breakdown", async () => {
  const res = await handler(
    makeReq({ token: "valid-token", breakdown: "agents" }),
    validSessionFactory(),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertExists(data.agents_breakdown);
  assertEquals(data.agents_breakdown, []);
});
