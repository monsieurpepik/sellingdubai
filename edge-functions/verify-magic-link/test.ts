import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("verify-magic-link");

Deno.test("verify-magic-link: valid token resolves to agent", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (!data.agent || data.agent.id !== agent.id) {
      throw new Error(`Expected agent.id ${agent.id}, got: ${JSON.stringify(data.agent)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("verify-magic-link: missing token returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) {
    throw new Error(`Expected 400, got ${res.status}`);
  }
});

Deno.test("verify-magic-link: unknown token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID() }),
  });
  if (res.status !== 401) {
    throw new Error(`Expected 401, got ${res.status}`);
  }
});

Deno.test("verify-magic-link: expired token returns 401", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string, {
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token }),
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401, got ${res.status}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});
