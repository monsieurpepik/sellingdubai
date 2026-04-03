import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("update-agent");

Deno.test("update-agent: valid token updates allowed fields", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string, {
    used_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, updates: { tagline: "Test tagline" } }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (data.agent?.tagline !== "Test tagline") {
      throw new Error(`Expected tagline "Test tagline", got: ${JSON.stringify(data.agent?.tagline)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("update-agent: missing token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates: { tagline: "x" } }),
  });
  await res.body?.cancel();
  if (res.status !== 401) {
    throw new Error(`Expected 401, got ${res.status}`);
  }
});

Deno.test("update-agent: disallowed field is filtered out", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string, {
    used_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, updates: { tier: "pro" } }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (data.agent?.tier !== "free") {
      throw new Error(`Expected tier to remain "free", got: ${JSON.stringify(data.agent?.tier)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("update-agent: name too long returns 400", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string, {
    used_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, updates: { name: "x".repeat(101) } }),
    });
    await res.body?.cancel();
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});
