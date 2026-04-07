import { assertEquals } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, token?: string, method = "POST"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request("http://localhost/refer-lead", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test("refer-lead: missing Authorization header returns 401", async () => {
  const res = await handler(
    makeReq({ receiver_slug: "someone", lead_name: "Test Lead" }),
    mockClientFactory(),
  );
  assertEquals(res.status, 401);
});

Deno.test("refer-lead: invalid Bearer token returns 401", async () => {
  // Default mock returns NOT_FOUND for single() on magic_links
  const res = await handler(
    makeReq({ receiver_slug: "someone", lead_name: "Test Lead" }, "bad-token"),
    mockClientFactory(),
  );
  assertEquals(res.status, 401);
});

Deno.test("refer-lead: unused magic link returns 401", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ receiver_slug: "someone", lead_name: "Test Lead" }, "valid-token"),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: null }, error: null },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("refer-lead: missing receiver_slug returns 400", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ lead_name: "Test Lead" }, "valid-token"),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      "agents": { data: { id: "agent-1", name: "Referrer", slug: "referrer", email: "r@test.com" }, error: null },
    }),
  );
  assertEquals(res.status, 400);
});

Deno.test("refer-lead: unknown agent (referrer not found) returns 404", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // No "agents" mock → single() returns NOT_FOUND for referrer → 404
  const res = await handler(
    makeReq({ receiver_slug: "nonexistent-agent", lead_name: "Test Lead" }, "valid-token"),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
    }),
  );
  assertEquals(res.status, 404);
});

Deno.test("refer-lead: GET returns 405", async () => {
  const req = new Request("http://localhost/refer-lead", { method: "GET" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 405);
});
