import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
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

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(req: Request, _createClient: CreateClientFn = createClient): Promise<Response> {
  const log = createLogger('create-portal-session', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const { token } = body ?? {};

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token." }), { status: 400, headers: cors });
    }

    const supabase = _createClient(
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
      .select("id, stripe_customer_id")
      .eq("id", agentId)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
    }

    if (!agent.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No billing account found. Please subscribe first." }), { status: 400, headers: cors });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const returnUrl = Deno.env.get("STRIPE_PORTAL_RETURN_URL") ?? "https://www.sellingdubai.ae/dashboard.html";

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: agent.stripe_customer_id,
        return_url: returnUrl,
      }),
    });

    if (!portalRes.ok) {
      const errBody = await portalRes.json();
      console.error("Stripe portal session creation failed");
      return new Response(JSON.stringify({ error: "Failed to open billing portal." }), { status: 502, headers: cors });
    }

    const portalSession = await portalRes.json();

    log({ event: 'success', status: 200, agent_id: agentId });
    return new Response(JSON.stringify({ url: portalSession.url }), { status: 200, headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("create-portal-session error");
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
