import { fnUrl, seedAgent, seedMagicLink, cleanupAgent } from "../_shared/test-helpers.ts";

const CHECKOUT_URL = fnUrl("create-checkout");

// Test 1: no auth token returns 400
Deno.test("create-checkout: missing token returns 400", async () => {
  const res = await fetch(CHECKOUT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "pro", interval: "monthly" }),
  });
  const data = await res.json();
  if (res.status !== 400) {
    throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
  }
});

// Test 2: agent already on requested plan returns 409
Deno.test("create-checkout: agent already on requested plan returns 409", async () => {
  const agent = await seedAgent({ tier: "pro" });
  const link = await seedMagicLink(agent.id as string, {
    used_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(CHECKOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, plan: "pro", interval: "monthly" }),
    });
    const data = await res.json();
    if (res.status !== 409) {
      throw new Error(`Expected 409, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (data.error !== "already_on_plan") {
      throw new Error(`Expected error "already_on_plan", got: ${JSON.stringify(data.error)}`);
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

// Test 3: missing Stripe price ID env var returns 500 (or 200 if price IS configured)
Deno.test("create-checkout: free agent with pro plan returns 500 or 200", async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id as string, {
    used_at: new Date().toISOString(),
  });
  try {
    const res = await fetch(CHECKOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, plan: "pro", interval: "monthly" }),
    });
    const data = await res.json();
    if (res.status !== 500 && res.status !== 200) {
      throw new Error(
        `Expected 500 (missing price env var) or 200 (price configured), got ${res.status}: ${JSON.stringify(data)}`,
      );
    }
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

// Test 4: valid free agent returns Stripe checkout URL (skip if no STRIPE_SECRET_KEY)
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
Deno.test(
  {
    name: "create-checkout: valid free agent returns Stripe checkout URL",
    ignore: !stripeKey,
  },
  async () => {
    const agent = await seedAgent();
    const link = await seedMagicLink(agent.id as string, {
      used_at: new Date().toISOString(),
    });
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: link.token, plan: "pro", interval: "monthly" }),
      });
      const data = await res.json();
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      }
      if (!data.url?.startsWith("https://checkout.stripe.com")) {
        throw new Error(`Expected Stripe checkout URL, got: ${JSON.stringify(data.url)}`);
      }
    } finally {
      await cleanupAgent(agent.id as string);
    }
  },
);
