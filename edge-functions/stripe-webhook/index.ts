import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe webhook — no CORS headers needed (Stripe calls this directly, not from browser)
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   (from `stripe listen` or Stripe Dashboard webhook signing secret)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

// Maps Stripe price IDs to internal plan names
// Env vars: STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, etc.
function buildPriceToTierMap(): Record<string, { tier: string; plan: string }> {
  return Object.fromEntries(
    Object.entries({
      [Deno.env.get("STRIPE_PRICE_PRO_MONTHLY")      ?? ""]: { tier: "pro",     plan: "pro_monthly"      },
      [Deno.env.get("STRIPE_PRICE_PRO_YEARLY")        ?? ""]: { tier: "pro",     plan: "pro_yearly"       },
      [Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY")   ?? ""]: { tier: "premium", plan: "premium_monthly"  },
      [Deno.env.get("STRIPE_PRICE_PREMIUM_YEARLY")    ?? ""]: { tier: "premium", plan: "premium_yearly"   },
    }).filter(([k]) => k !== ""),
  );
}

// HMAC-SHA256 webhook signature verification (Stripe's v1 scheme)
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !v1Part) return false;

  const timestamp = tPart.slice(2);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expectedSig = v1Part.slice(3);
  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison
  if (computed.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}

// Resolve agent_id from subscription metadata or customer lookup
async function resolveAgentId(
  supabase: ReturnType<typeof createClient>,
  metadata: Record<string, string>,
  customerId: string,
): Promise<string | null> {
  if (metadata?.agent_id) return metadata.agent_id;

  // Fallback: look up by stripe_customer_id
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for unknown customer); anything else is a DB error
    console.error("[stripe-webhook] DB error resolving agent by customer ID");
  }
  return data?.id ?? null;
}

// Map the first price in a subscription to { tier, plan }
function resolvePlan(
  priceToTier: Record<string, { tier: string; plan: string }>,
  subscription: Record<string, unknown>,
): { tier: string; plan: string } | null {
  const items = (subscription.items as { data: Array<{ price: { id: string } }> })?.data ?? [];
  for (const item of items) {
    const mapped = priceToTier[item.price.id];
    if (mapped) return mapped;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting all webhook requests.");
    return new Response("Service misconfigured.", { status: 500 });
  }

  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  if (!valid) {
    console.error("Stripe webhook signature verification failed.");
    return new Response("Unauthorized.", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const priceToTier = buildPriceToTierMap();
  const eventType = event.type as string;
  const data = (event.data as { object: Record<string, unknown> }).object;

  try {
    switch (eventType) {
      // ─── Checkout completed → activate subscription ───────────────────────
      case "checkout.session.completed": {
        if (data.mode !== "subscription") break;

        const subscriptionId = data.subscription as string;
        const customerId = data.customer as string;
        const meta = (data.metadata ?? {}) as Record<string, string>;
        const agentId = await resolveAgentId(supabase, meta, customerId);
        if (!agentId) {
          console.error("checkout.session.completed: no agent_id found for customer");
          break;
        }

        // Fetch full subscription from Stripe to get period + price
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!subRes.ok) {
          throw new Error(`Stripe subscription fetch failed: ${subRes.status}`);
        }
        const sub = await subRes.json() as Record<string, unknown>;
        const resolved = resolvePlan(priceToTier, sub);
        if (!resolved) {
          console.error(`checkout.session.completed: unknown price ID in subscription ${subscriptionId}, skipping tier update`);
          break;
        }
        const periodEnd = new Date((sub.current_period_end as number) * 1000).toISOString();

        await supabase.from("agents").update({
          tier:                      resolved.tier,
          stripe_subscription_id:    subscriptionId,
          stripe_customer_id:        customerId,
          stripe_subscription_status: "active",
          stripe_plan:               resolved.plan,
          stripe_current_period_end: periodEnd,
        }).eq("id", agentId);

        console.log(`checkout.session.completed: agent ${agentId} → ${resolved.tier}`);
        break;
      }

      // ─── Subscription updated (plan change, renewal, etc.) ─────────────────
      case "customer.subscription.updated": {
        const subscriptionId = data.id as string;
        const customerId = data.customer as string;
        const meta = ((data.metadata ?? {}) as Record<string, string>);
        const agentId = await resolveAgentId(supabase, meta, customerId);
        if (!agentId) {
          console.error("subscription.updated: no agent_id for customer");
          break;
        }

        const resolved = resolvePlan(priceToTier, data);
        if (!resolved) {
          console.error(`subscription.updated: unknown price ID for agent ${agentId} — tier unchanged`);
          break;
        }
        const periodEnd = new Date((data.current_period_end as number) * 1000).toISOString();
        const status = data.status as string;

        await supabase.from("agents").update({
          tier:                      resolved.tier,
          stripe_subscription_id:    subscriptionId,
          stripe_subscription_status: status,
          stripe_plan:               resolved.plan,
          stripe_current_period_end: periodEnd,
        }).eq("id", agentId);

        console.log(`subscription.updated: agent ${agentId} → ${resolved.tier}, status=${status}`);
        break;
      }

      // ─── Subscription canceled → downgrade to free ────────────────────────
      case "customer.subscription.deleted": {
        const customerId = data.customer as string;
        const meta = ((data.metadata ?? {}) as Record<string, string>);
        const agentId = await resolveAgentId(supabase, meta, customerId);
        if (!agentId) {
          console.error("subscription.deleted: no agent_id for customer");
          break;
        }

        await supabase.from("agents").update({
          tier:                      "free",
          stripe_subscription_id:    null,
          stripe_subscription_status: "canceled",
          stripe_plan:               null,
          stripe_current_period_end: null,
        }).eq("id", agentId);

        console.log(`subscription.deleted: agent ${agentId} → free`);
        break;
      }

      // ─── Payment succeeded → clear past_due, sync period end ──────────────
      case "invoice.payment_succeeded": {
        const subscriptionId = data.subscription as string;
        if (!subscriptionId) break; // one-off invoice, not a subscription

        const customerId = data.customer as string;
        const meta = ((data.subscription_details as { metadata?: Record<string, string> })?.metadata ?? {});
        const agentId = await resolveAgentId(supabase, meta, customerId);
        if (!agentId) {
          console.error("invoice.payment_succeeded: no agent_id for customer");
          break;
        }

        // Fetch subscription to get current period end
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!subRes.ok) {
          throw new Error(`Stripe subscription fetch failed: ${subRes.status}`);
        }
        const sub = await subRes.json() as Record<string, unknown>;
        const periodEnd = new Date((sub.current_period_end as number) * 1000).toISOString();
        const resolved = resolvePlan(priceToTier, sub);
        if (!resolved) {
          console.error(`invoice.payment_succeeded: unknown price ID in subscription ${subscriptionId}, skipping tier update`);
          break;
        }

        await supabase.from("agents").update({
          tier:                      resolved.tier,
          stripe_subscription_status: "active",
          stripe_plan:               resolved.plan,
          stripe_current_period_end: periodEnd,
        }).eq("id", agentId);

        console.log(`invoice.payment_succeeded: agent ${agentId} cleared to active`);
        break;
      }

      // ─── Payment failed → set past_due; tier preserved for 7-day grace ─────
      // Tier downgrade happens only if now > stripe_current_period_end + 7 days.
      // That enforcement lives in the feature-gating checks (read stripe_subscription_status).
      // Here we just mark the status so the UI can show a warning.
      case "invoice.payment_failed": {
        const subscriptionId = data.subscription as string;
        if (!subscriptionId) break;

        const customerId = data.customer as string;
        const meta = ((data.subscription_details as { metadata?: Record<string, string> })?.metadata ?? {});
        const agentId = await resolveAgentId(supabase, meta, customerId);
        if (!agentId) {
          console.error("invoice.payment_failed: no agent_id for customer");
          break;
        }

        // Set status to past_due but leave tier + period_end untouched.
        // Feature gates will check: if past_due AND now > period_end + 7 days → treat as free.
        await supabase.from("agents").update({
          stripe_subscription_status: "past_due",
        }).eq("id", agentId);

        console.log(`invoice.payment_failed: agent ${agentId} marked past_due (tier preserved during grace period)`);
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt so Stripe doesn't retry
        console.log(`Unhandled Stripe event: ${eventType}`);
    }
  } catch (e) {
    console.error(
      "Error processing Stripe event:",
      e instanceof Error ? e.stack : String(e),
      { eventType: typeof eventType !== "undefined" ? eventType : "unknown" }
    );
    // Return 500 so Stripe retries on transient errors (DB failures, network issues).
    // Stripe uses exponential backoff and will stop after ~3 days.
    return new Response(JSON.stringify({ error: "Processing error — will retry." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
