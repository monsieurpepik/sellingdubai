import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

const PRICE_MAP: Record<string, string | undefined> = {
  pro_monthly:      Deno.env.get("STRIPE_PRICE_PRO_MONTHLY"),
  pro_yearly:       Deno.env.get("STRIPE_PRICE_PRO_YEARLY"),
  premium_monthly:  Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY"),
  premium_yearly:   Deno.env.get("STRIPE_PRICE_PREMIUM_YEARLY"),
};

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const { token, plan, interval } = body ?? {};

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token." }), { status: 400, headers: cors });
    }
    if (!plan || !["pro", "premium"].includes(plan)) {
      return new Response(JSON.stringify({ error: "Invalid plan. Must be 'pro' or 'premium'." }), { status: 400, headers: cors });
    }
    if (!interval || !["monthly", "yearly"].includes(interval)) {
      return new Response(JSON.stringify({ error: "Invalid interval. Must be 'monthly' or 'yearly'." }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify magic link token
    const { data: linkRow, error: linkErr } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (linkErr || !linkRow) {
      return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });
    }
    if (new Date(linkRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401, headers: cors });
    }
    if (!linkRow.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), { status: 401, headers: cors });
    }

    const agentId: string = linkRow.agent_id;

    // Fetch agent
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, email, name, stripe_customer_id, tier")
      .eq("id", agentId)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const priceKey = `${plan}_${interval}`;
    const priceId = PRICE_MAP[priceKey];

    if (!priceId) {
      return new Response(JSON.stringify({ error: `Price not configured for ${priceKey}.` }), { status: 500, headers: cors });
    }

    // Upsert Stripe Customer
    let customerId: string = agent.stripe_customer_id ?? "";

    if (!customerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `create-customer-${agentId}`,
        },
        body: new URLSearchParams({
          email: agent.email,
          name: agent.name ?? "",
          "metadata[agent_id]": agentId,
        }),
      });

      if (!customerRes.ok) {
        const errBody = await customerRes.json();
        console.error("Stripe customer creation failed:", errBody);
        return new Response(JSON.stringify({ error: "Payment service is temporarily unavailable. Please try again in a moment." }), { status: 502, headers: cors });
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      const { error: updateErr } = await supabase
        .from("agents")
        .update({ stripe_customer_id: customerId })
        .eq("id", agentId);
      if (updateErr) {
        console.error("Failed to persist stripe_customer_id:", updateErr);
        return new Response(JSON.stringify({ error: "Billing setup failed. Please retry." }), { status: 500, headers: cors });
      }
    }

    // Create Checkout Session
    const successUrl = Deno.env.get("STRIPE_SUCCESS_URL") ?? "https://www.sellingdubai.ae/dashboard.html?billing=success";
    const cancelUrl  = Deno.env.get("STRIPE_CANCEL_URL")  ?? "https://www.sellingdubai.ae/pricing.html?billing=cancel";

    const sessionParams = new URLSearchParams({
      "customer": customerId,
      "mode": "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "subscription_data[metadata][agent_id]": agentId,
      "subscription_data[metadata][plan]": plan,
      "subscription_data[metadata][interval]": interval,
    });

    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sessionParams,
    });

    if (!sessionRes.ok) {
      const errBody = await sessionRes.json();
      console.error("Stripe session creation failed:", errBody);
      return new Response(JSON.stringify({ error: "Payment service is temporarily unavailable. Please try again in a moment." }), { status: 502, headers: cors });
    }

    const session = await sessionRes.json();

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: cors });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: cors });
  }
});
