// edge-functions/vapi-webhook/index.test.ts
// Unit tests for the vapi-webhook handler.

import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_AGENT_ID = "00000000-0000-0000-0000-000000000001";
const TEST_SECRET = "test-vapi-secret";

function makeReq(
  body: unknown,
  headers?: Record<string, string>,
): Request {
  const base: Record<string, string> = {
    "content-type": "application/json",
    ...headers,
  };
  return new Request("https://example.com/functions/v1/vapi-webhook", {
    method: "POST",
    headers: base,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("rejects missing secret", async () => {
  // Set env so the secret check is active
  Deno.env.set("VAPI_SERVER_SECRET", TEST_SECRET);
  try {
    const factory = mockClientFactory({});
    const req = makeReq(
      { message: { type: "assistant-request" } },
      { "x-vapi-secret": "wrong-secret" },
    );
    const res = await handler(req, factory);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  } finally {
    Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("assistant-request returns config for unknown caller", async () => {
  // No agents entry → agent lookup returns null → unregistered caller
  const factory = mockClientFactory({
    // agents maybeSingle() returns null by default when no entry provided
  });
  const req = makeReq({
    message: {
      type: "assistant-request",
      call: { customer: { number: "+971501234567" } },
    },
  });
  const res = await handler(req, factory);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.assistant, "object");
  assertEquals(typeof body.assistant.firstMessage, "string");
  // Unknown caller gets the sign-up message
  assertEquals(body.assistant.firstMessage.includes("sellingdubai.com"), true);
});

Deno.test("assistant-request returns personalised greeting for known agent", async () => {
  const factory = mockClientFactory({
    "agents": {
      data: { id: TEST_AGENT_ID, name: "Ahmed Al Nouri", agency_id: null },
      error: null,
    },
    "leads:count": { count: 3, error: null },
  });
  const req = makeReq({
    message: {
      type: "assistant-request",
      call: { customer: { number: "+971501234567" } },
    },
  });
  const res = await handler(req, factory);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.assistant.firstMessage.includes("Ahmed Al Nouri"), true);
  assertEquals(body.assistant.firstMessage.includes("3"), true);
  assertEquals(Array.isArray(body.assistant.tools), true);
});

Deno.test("tool-calls returns 404 for unknown caller", async () => {
  // No agents entry → agent lookup returns null
  const factory = mockClientFactory({});
  const req = makeReq({
    message: {
      type: "tool-calls",
      call: { customer: { number: "+971509999999" } },
      toolCallList: [],
    },
  });
  const res = await handler(req, factory);
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "Agent not found");
});

Deno.test("tool-calls executes tools and returns results array", async () => {
  const factory = mockClientFactory({
    "agents": {
      data: { id: TEST_AGENT_ID, name: "Ahmed Al Nouri", agency_id: null },
      error: null,
    },
    // get_stats calls leads (week + total) and properties counts
    "leads:count": { count: 5, error: null },
    "properties:count": { count: 2, error: null },
  });
  const req = makeReq({
    message: {
      type: "tool-calls",
      call: { customer: { number: "+971501234567" } },
      toolCallList: [
        {
          id: "tc_001",
          function: {
            name: "get_stats",
            arguments: "{}",
          },
        },
      ],
    },
  });
  const res = await handler(req, factory);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.results), true);
  assertEquals(body.results.length, 1);
  assertEquals(body.results[0].toolCallId, "tc_001");
  assertEquals(typeof body.results[0].result, "string");
});

Deno.test("unrecognised message type returns 200 ack", async () => {
  const factory = mockClientFactory({});
  const req = makeReq({
    message: {
      type: "end-of-call-report",
      call: { customer: { number: "+971501234567" } },
    },
  });
  const res = await handler(req, factory);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.received, true);
});
