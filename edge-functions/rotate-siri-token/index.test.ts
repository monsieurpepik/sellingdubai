// edge-functions/rotate-siri-token/index.test.ts
// Unit tests for the rotate-siri-token handler.

import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: unknown): Request {
  return new Request("https://example.com/functions/v1/rotate-siri-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST_DATE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("rejects missing token", async () => {
  const factory = mockClientFactory({});
  const req = makeReq({});
  const res = await handler(req, factory);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("token required"), true);
});

Deno.test("rejects invalid magic link", async () => {
  // magic_links returns no data (null) — invalid token
  const factory = mockClientFactory({
    // no "magic_links" entry → maybeSingle returns { data: null, error: null }
  });
  const req = makeReq({ token: "bad" });
  const res = await handler(req, factory);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rejects expired magic link", async () => {
  const factory = mockClientFactory({
    "magic_links": {
      data: {
        agent_id: "agent-001",
        revoked_at: null,
        used_at: null,
        expires_at: PAST_DATE,
      },
      error: null,
    },
  });
  const req = makeReq({ token: "expired-token" });
  const res = await handler(req, factory);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rotates siri_token successfully", async () => {
  const factory = mockClientFactory({
    "magic_links": {
      data: {
        agent_id: "agent-001",
        revoked_at: null,
        used_at: null,
        expires_at: FUTURE_DATE,
      },
      error: null,
    },
    // write result for agents update — single() on a write uses agents:write or agents key
    "agents": {
      data: { siri_token: "new-uuid-1234" },
      error: null,
    },
  });
  const req = makeReq({ token: "valid-token" });
  const res = await handler(req, factory);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.siri_token, "string");
  assertEquals(body.siri_token.length > 0, true);
});
