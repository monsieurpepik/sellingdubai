import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("export-leads");

Deno.test("export-leads: missing Authorization header returns 401", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("export-leads: invalid Bearer token returns 401", async () => {
  const res = await fetch(URL, {
    method: "GET",
    headers: { "Authorization": `Bearer ${crypto.randomUUID()}` },
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("export-leads: valid token returns CSV content", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedUsedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "GET",
      headers: { "Authorization": `Bearer ${link.token}` },
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/csv") && !contentType.includes("application/octet-stream")) {
      throw new Error(`Expected CSV content-type, got: ${contentType}`);
    }
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});
