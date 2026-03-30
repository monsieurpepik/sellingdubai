import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const VALID_STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { token, lead_id, status } = await req.json();

    if (!token) return json({ error: "Authentication required." }, 401, cors);
    if (!lead_id) return json({ error: "lead_id is required." }, 400, cors);
    if (!status || !VALID_STATUSES.includes(status)) {
      return json({ error: "Invalid status. Must be one of: " + VALID_STATUSES.join(", ") }, 400, cors);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Verify magic link token
    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (linkErr || !link) {
      return json({ error: "Invalid or expired session." }, 401, cors);
    }

    if (new Date(link.expires_at) < new Date()) {
      return json({ error: "Session expired. Please log in again." }, 401, cors);
    }

    if (!link.used_at) {
      return json({ error: "Session not activated. Please use the login link sent to your email." }, 401, cors);
    }

    // Update lead — only if it belongs to this agent
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", lead_id)
      .eq("agent_id", link.agent_id)
      .select("id, status")
      .single();

    if (leadErr || !lead) {
      return json({ error: "Lead not found or you don't have permission." }, 404, cors);
    }

    return json({ success: true, lead }, 200, cors);
  } catch (err) {
    console.error("update-lead-status error");
    return json({ error: "Internal server error" }, 500, getCorsHeaders(req));
  }
});
