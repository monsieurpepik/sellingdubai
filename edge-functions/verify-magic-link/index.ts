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
const IS_LOCAL_DEV = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalOrigin = IS_LOCAL_DEV &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
  const allowedOrigin = isLocalOrigin ? origin
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
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
      .is("revoked_at", null)
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

    // Fetch full agent data first — only mark token used if agent exists
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

    // Mark as used (first use) — but don't invalidate for session re-verification
    if (!link.used_at) {
      await supabase
        .from("magic_links")
        .update({ used_at: new Date().toISOString() })
        .eq("id", link.id);
    }

    // Return agent data — allowlist only the fields the dashboard needs
    const DASHBOARD_FIELDS = [
      'id', 'slug', 'full_name', 'name', 'email', 'phone',
      'photo_url', 'profile_photo_url', 'cover_photo_url', 'background_image_url',
      'agency_name', 'agency_logo_url', 'tagline',
      'title', 'dld_number', 'rera_number', 'brn_number', 'broker_number',
      'dld_broker_number', 'dld_broker_id', 'license_image_url',
      'verification_status', 'tier', 'is_active', 'email_verified',
      'onboarding_complete', 'profile_complete',
      'whatsapp', 'whatsapp_number', 'languages', 'specializations', 'areas',
      'instagram_handle', 'tiktok_handle', 'linkedin_url', 'youtube_url',
      'instagram_url', 'tiktok_url',
      'website_url', 'calendly_url',
      'custom_link_1_label', 'custom_link_1_url',
      'custom_link_2_label', 'custom_link_2_url',
      'show_mortgage_calculator', 'show_properties', 'show_off_plan',
      'show_preapproval', 'show_golden_visa',
      'property_order', 'link_buttons',
      'referral_code', 'referral_count',
      'webhook_url', 'facebook_pixel_id', 'ga4_measurement_id',
    ];
    const safeAgent: Record<string, unknown> = {};
    for (const field of DASHBOARD_FIELDS) {
      if (field in agent) safeAgent[field] = agent[field];
    }

    return new Response(
      JSON.stringify({ agent: safeAgent }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    console.error("verify-magic-link error:", e instanceof Error ? e.stack : String(e));
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  }
});
