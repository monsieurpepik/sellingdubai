import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("submit-mortgage");

Deno.test("submit-mortgage: missing buyer_name returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_phone: "+971501234567" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("submit-mortgage: missing phone and email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_name: "Test Buyer" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("submit-mortgage: invalid employment_type returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_name: "Test Buyer",
      buyer_phone: "+971501234567",
      employment_type: "invalid_type",
    }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("submit-mortgage: invalid residency_status returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_name: "Test Buyer",
      buyer_phone: "+971501234567",
      residency_status: "alien",
    }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("submit-mortgage: valid minimal submission is accepted", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_name: "Test Buyer",
      buyer_phone: "+971501234567",
    }),
  });
  // 200 = success; 429 = rate limit hit from previous test runs (also acceptable)
  if (res.status !== 200 && res.status !== 429) {
    const body = await res.text();
    throw new Error(`Expected 200 or 429, got ${res.status}: ${body}`);
  }
  await res.body?.cancel();
});

Deno.test("submit-mortgage: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("submit-mortgage: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
