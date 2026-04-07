import { assertEquals } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/track-referral", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });
}

Deno.test("track-referral: missing agent_id returns 400", async () => {
  const res = await handler(makeReq({ referral_code: "some-code" }), mockClientFactory());
  assertEquals(res.status, 400);
});

Deno.test("track-referral: missing referral_code returns 400", async () => {
  const res = await handler(makeReq({ agent_id: "some-uuid" }), mockClientFactory());
  assertEquals(res.status, 400);
});

Deno.test("track-referral: invalid referral_code returns 200 silently", async () => {
  // Function silently returns 200 for unknown codes to avoid leaking info
  const res = await handler(
    makeReq({ referral_code: "nonexistent-code", agent_id: "new-agent-id" }),
    mockClientFactory({
      // agents maybeSingle returns null (no match) → silent 200
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
});

Deno.test("track-referral: valid referral creates record and returns 200", async () => {
  const res = await handler(
    makeReq({ referral_code: "valid-code", agent_id: "new-agent-id" }),
    mockClientFactory({
      "agents": { data: { id: "referrer-id", name: "Referrer", slug: "referrer" }, error: null },
      // referrals maybeSingle → null (not already referred)
    }),
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.referrer_name, "Referrer");
});

Deno.test("track-referral: GET returns 405", async () => {
  const res = await handler(makeReq({}, "GET"), mockClientFactory());
  assertEquals(res.status, 405);
});
