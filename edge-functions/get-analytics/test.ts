import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/get-analytics", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("get-analytics: missing token returns 401", async () => {
  const res = await handler(makeReq({}), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("get-analytics: invalid token returns 401", async () => {
  // Default mock returns NOT_FOUND for single() → linkErr set → 401
  const res = await handler(makeReq({ token: "bad-token" }), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("get-analytics: unused magic link returns 401", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", used_at: null }, error: null },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("get-analytics: valid session returns analytics structure", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq({ token: "valid-token" }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", used_at: new Date().toISOString() }, error: null },
      "page_events": { data: [], error: null },
      "leads": { data: [], error: null },
      "referrals": { data: [], error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  // Function returns data.this_month.views (not data.views_this_month)
  assertExists(data.this_month);
  assertExists(data.last_month);
  assertExists(data.chart);
  assertEquals(typeof data.this_month.views, "number");
});

Deno.test("get-analytics: OPTIONS returns 200", async () => {
  const req = new Request("http://localhost/get-analytics", { method: "OPTIONS" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 200);
});
