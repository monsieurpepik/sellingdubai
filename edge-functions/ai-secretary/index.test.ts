// edge-functions/ai-secretary/index.test.ts
// Unit tests for the ai-secretary orchestrator handler.

import { assertEquals } from "jsr:@std/assert";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_AGENT_ID = "00000000-0000-0000-0000-000000000001";
const TEST_TOKEN = "test-magic-link-token";

function makeReq(
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  const base: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "1.2.3.4",
    ...headers,
  };
  return new Request("https://example.com/functions/v1/ai-secretary", {
    method,
    headers: base,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Stub globalThis.fetch to intercept Anthropic API calls and return a canned response. */
function stubClaudeFetch(reply: string): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("anthropic.com") || url.includes("api.anthropic")) {
      const claudeResponse = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: reply }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      };
      return new Response(JSON.stringify(claudeResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("OPTIONS → 200 with CORS headers", async () => {
  const req = makeReq("OPTIONS");
  const res = await handler(req);
  assertEquals(res.status, 200);
  // CORS headers should be present
  const origin = res.headers.get("access-control-allow-origin");
  const methods = res.headers.get("access-control-allow-methods");
  assertEquals(typeof origin, "string");
  assertEquals(methods?.includes("POST"), true);
});

Deno.test("Missing message → 400", async () => {
  const req = makeReq("POST", { channel: "whatsapp" });
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "message is required.");
});

Deno.test("Invalid channel → 400", async () => {
  const req = makeReq("POST", { message: "hello", channel: "fax" });
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
  assertEquals(body.error.includes("channel must be one of"), true);
});

Deno.test("Missing Authorization header → 401", async () => {
  const req = makeReq("POST", { message: "hello", channel: "whatsapp" });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized.");
});

Deno.test("Invalid token → 401", async () => {
  // Default mock: magic_links returns NOT_FOUND (no override provided)
  const factory = mockClientFactory({});
  const req = makeReq(
    "POST",
    { message: "hello", channel: "whatsapp" },
    { authorization: "Bearer invalid-token-xyz" },
  );
  const res = await handler(req, factory);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token.");
});

Deno.test("Valid whatsapp request → 200 with reply and actions_taken", async () => {
  // Set a dummy API key so the Anthropic SDK passes its validation check
  Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-key-for-unit-tests");
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

  // used_at must be non-null for verifyMagicLinkToken to accept the link
  const factory = mockClientFactory({
    "magic_links": {
      data: {
        agent_id: TEST_AGENT_ID,
        used_at: "2026-01-01T00:00:00.000Z",
        revoked_at: null,
        expires_at: null,
      },
      error: null,
    },
    "agents": {
      data: { id: TEST_AGENT_ID, name: "Ahmed Al Nouri", agency_name: null },
      error: null,
    },
    "whatsapp_sessions": { data: null, error: null },
  });

  const req = makeReq(
    "POST",
    { message: "How many leads do I have today?", channel: "whatsapp" },
    { authorization: `Bearer ${TEST_TOKEN}` },
  );

  const restore = stubClaudeFetch("You have 3 leads today.");
  try {
    const res = await handler(req, factory);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(typeof body.reply, "string");
    assertEquals(Array.isArray(body.actions_taken), true);
  } finally {
    restore();
  }
});
