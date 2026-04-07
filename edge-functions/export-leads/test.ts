import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(token?: string, method = "GET"): Request {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request("http://localhost/export-leads", { method, headers });
}

Deno.test("export-leads: missing Authorization header returns 401", async () => {
  const res = await handler(makeReq(), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("export-leads: invalid Bearer token returns 401", async () => {
  // Default mock returns NOT_FOUND for single() on magic_links
  const res = await handler(makeReq("bad-token"), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("export-leads: unused magic link returns 401", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq("valid-token"),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: null }, error: null },
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("export-leads: valid token with no leads returns CSV with header only", async () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await handler(
    makeReq("valid-token"),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: futureDate, used_at: new Date().toISOString() }, error: null },
      "leads": { data: [], error: null },
    }),
  );
  assertEquals(res.status, 200);
  const contentType = res.headers.get("content-type") || "";
  assertStringIncludes(contentType, "text/csv");
  const body = await res.text();
  assertStringIncludes(body, "Name");
});

Deno.test("export-leads: OPTIONS returns 200", async () => {
  const req = new Request("http://localhost/export-leads", { method: "OPTIONS" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 200);
});
