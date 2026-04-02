import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  signStripePayload,
} from "../_shared/test-helpers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = fnUrl("stripe-webhook");
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "whsec_test_local";

Deno.test("stripe-webhook: missing Stripe-Signature header returns 401", async () => {
  const body = JSON.stringify({ type: "test.event", data: { object: {} } });
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (res.status !== 401) {
    throw new Error(`Expected 401, got ${res.status}`);
  }
});

Deno.test("stripe-webhook: invalid HMAC signature returns 401", async () => {
  const body = JSON.stringify({ type: "test.event", data: { object: {} } });
  const wrongSig = await signStripePayload(body, "whsec_wrong_secret_totally_invalid");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": wrongSig,
    },
    body,
  });
  if (res.status !== 401) {
    throw new Error(`Expected 401, got ${res.status}`);
  }
});

Deno.test(
  "stripe-webhook: customer.subscription.deleted downgrades agent tier to free",
  async () => {
    const agent = await seedAgent({ tier: "pro", stripe_customer_id: `cus_test_${crypto.randomUUID().slice(0, 8)}` });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: `sub_test_${crypto.randomUUID().slice(0, 8)}`,
          customer: agent.stripe_customer_id,
          metadata: { agent_id: agent.id },
          status: "canceled",
          items: { data: [{ price: { id: "price_test", recurring: { interval: "month" } } }] },
        },
      },
    };
    const body = JSON.stringify(event);
    const sig = await signStripePayload(body, WEBHOOK_SECRET);
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": sig,
        },
        body,
      });
      const data = await res.json();
      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      }
      const { data: updated } = await supabase
        .from("agents")
        .select("tier")
        .eq("id", agent.id)
        .single();
      if (updated?.tier !== "free") {
        throw new Error(`Expected tier 'free', got '${updated?.tier}'`);
      }
    } finally {
      await cleanupAgent(agent.id as string);
    }
  },
);

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
Deno.test(
  {
    name: "stripe-webhook: checkout.session.completed updates agent tier",
    ignore: !stripeKey,
  },
  async () => {
    // This test requires STRIPE_SECRET_KEY set to a valid sk_test_... value
    // and a real completed checkout session ID. It is skipped when the key is absent.
    // To run: ensure STRIPE_SECRET_KEY and a real checkout.session.completed event body are available.
    // The event must reference a subscription ID that exists in Stripe test mode.
    throw new Error(
      "This test requires a real Stripe test checkout.session.completed event. " +
        "Populate event body with a real session from Stripe dashboard or CLI.",
    );
  },
);
