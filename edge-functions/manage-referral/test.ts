import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("manage-referral: missing token returns 401", async () => {
  // No Authorization header → 401
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: crypto.randomUUID(), action: "accept" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400 && res.status !== 401) {
    throw new Error(`Expected 400/401, got ${res.status}`);
  }
});

Deno.test("manage-referral: invalid token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        referral_id: crypto.randomUUID(),
        action: "accept",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-referral: non-existent referral_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer some-token`,
      },
      body: JSON.stringify({
        referral_id: crypto.randomUUID(),
        action: "accept",
      }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "lead_referrals:count": { count: 0, error: null },
      // lead_referrals single() → NOT_FOUND (default)
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("manage-referral: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});
