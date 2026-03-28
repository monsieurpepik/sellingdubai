// ===========================================
// VERIFY MAGIC LINK — SellingDubai Agent Auth
// ===========================================
// Validates a magic link token, returns agent data if valid.
// Token is single-use but stays valid for re-verification
// during the session (15 minute window).
//
// POST { token: "abc123..." }
// Returns { agent: { ...full agent data } }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token is required." }),
        { status: 400, headers: cors }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the magic link
    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .single();

    if (linkErr || !link) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link. Request a new one." }),
        { status: 401, headers: cors }
      );
    }

    // Check expiry
    if (new Date(link.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This link has expired. Request a new one." }),
        { status: 401, headers: cors }
      );
    }

    // Mark as used (first use) — but don't invalidate for session re-verification
    if (!link.used_at) {
      await supabase
        .from("magic_links")
        .update({ used_at: new Date().toISOString() })
        .eq("id", link.id);
    }

    // Fetch full agent data
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("*")
      .eq("id", link.agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found or deactivated." }),
        { status: 404, headers: cors }
      );
    }

    // Return agent data — strip ALL sensitive fields
    const SENSITIVE_FIELDS = [
      'instagram_access_token', 'instagram_user_id',
      'tiktok_access_token', 'tiktok_user_id',
      'facebook_capi_token',
      'created_at', 'updated_at',
    ];
    const safeAgent = { ...agent };
    for (const field of SENSITIVE_FIELDS) {
      delete safeAgent[field];
    }

    return new Response(
      JSON.stringify({ agent: safeAgent }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    console.error("verify-magic-link error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  }
});
