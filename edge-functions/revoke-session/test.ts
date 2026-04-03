import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("revoke-session");

Deno.test("revoke-session: missing token returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("revoke-session: unknown token returns 200 (silent — no enumeration)", async () => {
  // revoke-session returns success even for unknown tokens to prevent enumeration
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID() }),
  });
  if (res.status !== 200) throw new Error(`Expected 200 for unknown token, got ${res.status}`);
  const data = await res.json();
  if (data.success !== true) throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
});

Deno.test("revoke-session: valid token is revoked and marked revoked_at", async () => {
  const agent = await seedAgent();
  try {
    const link = await seedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.success !== true) throw new Error(`Expected success:true`);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("revoke-session: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
