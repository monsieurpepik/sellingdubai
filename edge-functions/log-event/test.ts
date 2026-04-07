import { assertEquals } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/log-event", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });
}

Deno.test("log-event: missing agent_id returns 400", async () => {
  const res = await handler(makeReq({ event_type: "view" }), mockClientFactory());
  assertEquals(res.status, 400);
});

Deno.test("log-event: missing event_type returns 400", async () => {
  const res = await handler(makeReq({ agent_id: "some-uuid" }), mockClientFactory());
  assertEquals(res.status, 400);
});

Deno.test("log-event: invalid event_type returns 400", async () => {
  const res = await handler(
    makeReq({ agent_id: "some-uuid", event_type: "invalid_type" }),
    mockClientFactory(),
  );
  assertEquals(res.status, 400);
});

Deno.test("log-event: valid view event with verified agent returns 200", async () => {
  const res = await handler(
    makeReq({ agent_id: "agent-1", event_type: "view" }),
    mockClientFactory({
      // agents count query → 1 verified agent found
      "agents:count": { count: 1, error: null },
      // page_events count for rate limit → 0
      "page_events:count": { count: 0, error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

Deno.test("log-event: unverified agent returns 400", async () => {
  // agents:count returns 0 → agent not verified
  const res = await handler(
    makeReq({ agent_id: "unknown-agent", event_type: "view" }),
    mockClientFactory({
      "agents:count": { count: 0, error: null },
    }),
  );
  assertEquals(res.status, 400);
});

Deno.test("log-event: GET returns 405", async () => {
  const res = await handler(makeReq({}, "GET"), mockClientFactory());
  assertEquals(res.status, 405);
});
