import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("weekly-stats");

Deno.test("weekly-stats: missing secret returns 401", async () => {
  const res = await fetch(URL, { method: "POST" });
  if (res.status !== 401) throw new Error(`Expected 401 for missing secret, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("weekly-stats: wrong secret returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "x-cron-secret": "wrong-secret-value" },
  });
  if (res.status !== 401) throw new Error(`Expected 401 for wrong secret, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("weekly-stats: wrong Bearer secret returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Authorization": `Bearer wrong-secret-${crypto.randomUUID()}` },
  });
  if (res.status !== 401) throw new Error(`Expected 401 for wrong Bearer, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("weekly-stats: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`Expected 204/200 for OPTIONS, got ${res.status}`);
  }
  await res.body?.cancel();
});
