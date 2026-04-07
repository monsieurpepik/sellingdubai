import { assertEquals } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/agency-stats", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: null }, error: null },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("agency-stats: agent without agency returns 403", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // agencies maybeSingle returns null (no agency found)
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      // agencies not set → maybeSingle returns { data: null, error: null } → 403
    }),
  );
  assertEquals(res.status, 403);
});

Deno.test("agency-stats: valid session with agency but no members returns 200", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      "agencies": { data: { id: "agency-1", name: "Test Agency", slug: "test-agency", logo_url: null }, error: null },
      // agents array → empty by default → returns { agency, agents: [], totals: ... }
    }),
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
