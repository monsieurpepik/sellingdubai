import { handler, verifyStripeSignature } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_test_dummy_secret");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy");

// Helper: produce a valid Stripe v1 signature for the given payload + secret
async function signStripePayload(payload: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

Deno.test("stripe-webhook: missing Stripe-Signature header returns 401", async () => {
  const body = JSON.stringify({ type: "test.event", data: { object: {} } });
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("stripe-webhook: invalid HMAC signature returns 401", async () => {
  const body = JSON.stringify({ type: "test.event", data: { object: {} } });
  const wrongSig = await signStripePayload(body, "whsec_wrong_secret_totally_invalid");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": wrongSig,
      },
      body,
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("stripe-webhook: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("stripe-webhook: unhandled event type returns 200", async () => {
  const body = JSON.stringify({ type: "some.unknown.event", data: { object: {} } });
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.received) throw new Error(`Expected received:true, got ${JSON.stringify(data)}`);
});

Deno.test("stripe-webhook: customer.subscription.deleted downgrades agent tier to free", async () => {
  const event = {
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_123",
        customer: "cus_test_123",
        metadata: { agent_id: "agent-unit-1" },
        status: "canceled",
        items: { data: [{ price: { id: "price_test", recurring: { interval: "month" } } }] },
      },
    },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-unit-1", tier: "free" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.received) throw new Error(`Expected received:true, got ${JSON.stringify(data)}`);
});

Deno.test("stripe-webhook: invoice.payment_failed marks agent past_due", async () => {
  const event = {
    type: "invoice.payment_failed",
    data: {
      object: {
        subscription: "sub_test_456",
        customer: "cus_test_456",
        subscription_details: { metadata: { agent_id: "agent-unit-2" } },
      },
    },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-unit-2" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

// ── subscription.updated with known agent_id in metadata ──

Deno.test("stripe-webhook: customer.subscription.updated with agent_id succeeds", async () => {
  Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly_test");
  const event = {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_789",
        customer: "cus_test_789",
        metadata: { agent_id: "agent-unit-3" },
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        items: { data: [{ price: { id: "price_pro_monthly_test" } }] },
      },
    },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-unit-3" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

// ── subscription.updated with unknown price ID is no-op (tier unchanged) ──

Deno.test("stripe-webhook: subscription.updated with unknown price skips tier update", async () => {
  const event = {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_unknown",
        customer: "cus_test_unknown",
        metadata: { agent_id: "agent-unit-4" },
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        items: { data: [{ price: { id: "price_totally_unknown" } }] },
      },
    },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory({
      "agents": { data: { id: "agent-unit-4" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

// ── invoice.payment_succeeded without subscription is no-op ──

Deno.test("stripe-webhook: payment_succeeded without subscription is no-op", async () => {
  const event = {
    type: "invoice.payment_succeeded",
    data: { object: { subscription: null, customer: "cus_test_noop" } },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

// ── checkout.session.completed with non-subscription mode is no-op ──

Deno.test("stripe-webhook: checkout.session.completed with mode=payment is no-op", async () => {
  const event = {
    type: "checkout.session.completed",
    data: { object: { mode: "payment", subscription: null, customer: "cus_oneoff", metadata: {} } },
  };
  const body = JSON.stringify(event);
  const sig = await signStripePayload(body, "whsec_test_dummy_secret");
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
      body,
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

// ── Missing STRIPE_WEBHOOK_SECRET returns 500 ──

Deno.test("stripe-webhook: missing webhook secret returns 500", async () => {
  const saved = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  Deno.env.delete("STRIPE_WEBHOOK_SECRET");
  try {
    const res = await handler(
      new Request("http://localhost", { method: "POST", body: '{}' }),
      mockClientFactory(),
    );
    if (res.status !== 500) throw new Error(`Expected 500, got ${res.status}`);
  } finally {
    if (saved) Deno.env.set("STRIPE_WEBHOOK_SECRET", saved);
  }
});

// ── Signature verification unit tests ──

Deno.test("verifyStripeSignature: valid signature passes", async () => {
  const payload = '{"test":true}';
  const secret = "whsec_unit_test";
  const sig = await signStripePayload(payload, secret);
  const valid = await verifyStripeSignature(payload, sig, secret);
  if (!valid) throw new Error("Expected valid signature");
});

Deno.test("verifyStripeSignature: wrong secret fails", async () => {
  const payload = '{"test":true}';
  const sig = await signStripePayload(payload, "whsec_correct");
  const valid = await verifyStripeSignature(payload, sig, "whsec_wrong");
  if (valid) throw new Error("Expected invalid signature");
});

Deno.test("verifyStripeSignature: missing v1= fails", async () => {
  const valid = await verifyStripeSignature("{}", `t=${Math.floor(Date.now() / 1000)}`, "secret");
  if (valid) throw new Error("Expected invalid signature");
});

// checkout.session.completed requires a live Stripe API call to fetch the subscription
Deno.test.ignore("stripe-webhook: checkout.session.completed updates agent tier (requires Stripe API)", async () => {
  throw new Error("Requires real Stripe test subscription. Run with live STRIPE_SECRET_KEY.");
});
