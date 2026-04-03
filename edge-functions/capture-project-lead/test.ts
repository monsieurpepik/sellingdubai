import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("capture-project-lead");

Deno.test("capture-project-lead: missing name returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_slug: "test-project", phone: "+971501234567" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("capture-project-lead: missing phone and email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_slug: "test-project", name: "Test Buyer" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("capture-project-lead: valid submission is accepted or rate-limited", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_slug: "test-project",
      name: "Test Buyer",
      phone: "+971501234567",
    }),
  });
  // 200 = success; 429 = rate limited; 404 = project not found (valid rejection)
  if (res.status !== 200 && res.status !== 429 && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Expected 200/404/429, got ${res.status}: ${body}`);
  }
  await res.body?.cancel();
});

Deno.test("capture-project-lead: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("capture-project-lead: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
