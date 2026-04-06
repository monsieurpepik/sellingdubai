import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

/**
 * track-referral
 * Called after a new agent completes signup via /join?ref=CODE
 * Creates a referral record linking the new agent to the referrer.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://staging.sellingdubai.com",
  "http://localhost:3000",
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const log = createLogger('track-referral', req);
  const _start = Date.now();
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const referralCode = (body.referral_code || "").trim().toLowerCase().slice(0, 50);
    const referredAgentId = (body.agent_id || "").trim();

    if (!referralCode || !referredAgentId) {
      log({ event: 'bad_request', status: 400 });
      return new Response(JSON.stringify({ error: "Missing referral_code or agent_id" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find the referrer by their referral_code
    const { data: referrer } = await supabase
      .from("agents")
      .select("id, name, slug")
      .eq("referral_code", referralCode)
      .single();

    if (!referrer) {
      // Silent success — don't leak that the code is invalid
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Don't let agents refer themselves
    if (referrer.id === referredAgentId) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check if this agent was already referred
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_id", referredAgentId)
      .maybeSingle();

    if (existing) {
      // Already has a referrer, don't overwrite
      return new Response(JSON.stringify({ ok: true, already_referred: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Create referral record
    const { error: insertErr } = await supabase.from("referrals").insert({
      referrer_id: referrer.id,
      referred_id: referredAgentId,
      referral_code: referralCode,
      status: "pending",
    });

    if (insertErr) {
      log({ event: 'error', status: 500, agent_id: referredAgentId, error: String(insertErr) });
      console.error("Referral insert error");
      // Still return success to not break signup flow
    } else {
      console.log(`Referral tracked: ${referrer.slug} → ${referredAgentId}`);
    }

    log({ event: 'success', status: 200, agent_id: referredAgentId });
    return new Response(JSON.stringify({ ok: true, referrer_name: referrer.name }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    console.error("track-referral error");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
});
