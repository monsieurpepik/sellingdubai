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

// ─── C6 fix: DB error → 500 so Stripe retries ─────────────────────────────

Deno.test("stripe-webhook: customer.subscription.deleted — agents.update DB error returns 500", async () => {
  const event = {
    id: "evt_deleted_dberr",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_err",
        customer: "cus_test_err",
        metadata: { agent_id: "agent-dberr-1" },
        status: "canceled",
        items: { data: [{ price: { id: "price_test" } }] },
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
      "agents:write": { data: null, error: { message: "connection timeout" } },
    }),
  );
  if (res.status !== 500) throw new Error(`Expected 500 so Stripe retries, got ${res.status}`);
});

Deno.test("stripe-webhook: invoice.payment_failed — agents.update DB error returns 500", async () => {
  const event = {
    id: "evt_failed_dberr",
    type: "invoice.payment_failed",
    data: {
      object: {
        subscription: "sub_test_err2",
        customer: "cus_test_err2",
        subscription_details: { metadata: { agent_id: "agent-dberr-2" } },
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
      "agents:write": { data: null, error: { message: "connection timeout" } },
    }),
  );
  if (res.status !== 500) throw new Error(`Expected 500 so Stripe retries, got ${res.status}`);
});

Deno.test("stripe-webhook: subscription_events insert failure does not affect 200 response", async () => {
  // subscription_events is fire-and-forget — insert failure must never cause a 500
  const event = {
    id: "evt_se_fail",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_sfail",
        customer: "cus_test_sfail",
        metadata: { agent_id: "agent-sfail-1" },
        status: "canceled",
        items: { data: [{ price: { id: "price_test" } }] },
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
      // agents:write succeeds; subscription_events:write fails — response should still be 200
      "agents:write": { data: null, error: null },
      "subscription_events:write": { data: null, error: { message: "table not found" } },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200 (subscription_events failure is fire-and-forget), got ${res.status}`);
  const data = await res.json();
  if (!data.received) throw new Error(`Expected received:true`);
});

// checkout.session.completed requires a live Stripe API call to fetch the subscription
Deno.test.ignore("stripe-webhook: checkout.session.completed updates agent tier (requires Stripe API)", async () => {
  throw new Error("Requires real Stripe test subscription. Run with live STRIPE_SECRET_KEY.");
});
