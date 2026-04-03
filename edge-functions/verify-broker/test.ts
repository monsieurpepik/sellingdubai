import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("verify-broker");

Deno.test("verify-broker: missing broker_number returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("verify-broker: string broker_number returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ broker_number: "not-a-number" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("verify-broker: unknown BRN returns 404 with verified:false", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ broker_number: 9999999 }),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (data.verified !== false) {
    throw new Error(`Expected verified:false, got: ${JSON.stringify(data)}`);
  }
});

Deno.test("verify-broker: test mode BRN=0 returns verified broker when ENABLE_TEST_MODE=true", async () => {
  // When ENABLE_TEST_MODE=true is set in the edge function env, broker_number=0
  // returns a synthetic verified broker without a DLD lookup.
  // If test mode is off (prod), 0 is rejected as an unknown BRN.
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ broker_number: 0 }),
  });
  if (res.status === 200) {
    const data = await res.json();
    if (data.verified !== true) {
      throw new Error(`Test mode: expected verified:true, got: ${JSON.stringify(data)}`);
    }
    if (!data.broker || data.broker.broker_number !== 0) {
      throw new Error(`Test mode: expected broker.broker_number=0, got: ${JSON.stringify(data)}`);
    }
  } else if (res.status !== 400 && res.status !== 404) {
    throw new Error(`Expected 200/400/404, got ${res.status}`);
  } else {
    await res.body?.cancel();
  }
});

Deno.test("verify-broker: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("verify-broker: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
  await res.body?.cancel();
});
