import { assertEquals } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(secret?: string, method = "GET"): Request {
  const headers: Record<string, string> = {};
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  return new Request("http://localhost/weekly-stats", { method, headers });
}

Deno.test("weekly-stats: missing CRON_SECRET env returns 401", async () => {
  // CRON_SECRET not set in test env → handler returns 401
  const res = await handler(makeReq(), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("weekly-stats: wrong secret returns 401", async () => {
  const res = await handler(makeReq("wrong-secret"), mockClientFactory());
  // Either 401 (no CRON_SECRET env) or 401 (wrong secret)
  assertEquals(res.status, 401);
});

Deno.test("weekly-stats: OPTIONS returns 200", async () => {
  const req = new Request("http://localhost/weekly-stats", { method: "OPTIONS" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 200);
});

// Skipped: requires live Resend API and valid CRON_SECRET env var
Deno.test.ignore("weekly-stats: valid secret with no active agents returns sent=0", async () => {
  const secret = Deno.env.get("CRON_SECRET") || "test-secret";
  const res = await handler(
    makeReq(secret),
    mockClientFactory({
      "agents": { data: [], error: null },
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.sent, 0);
});
