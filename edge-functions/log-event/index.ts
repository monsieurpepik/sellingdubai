import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

Deno.serve(async (req: Request) => {
  const CORS = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });
  }

  try {
    const body = await req.json();
    const { agent_id, event_type, metadata, referrer } = body;

    if (!agent_id || !event_type) {
      return new Response(JSON.stringify({ error: "agent_id and event_type required" }), { status: 400, headers: CORS });
    }

    const validTypes = [
      'view',
      'whatsapp_tap',
      'lead_submit',
      'link_click',
      'phone_tap',
      'share',
      'mortgage_calc_open',
      'mortgage_eligibility_check',
      'mortgage_application_submitted',
      'mortgage_doc_uploaded',
    ];
    if (!validTypes.includes(event_type)) {
      return new Response(JSON.stringify({ error: "Invalid event_type" }), { status: 400, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip") || "unknown";
    const ipHash = hashIP(clientIP);
    const userAgent = req.headers.get("user-agent") || "";

    // Dedup: skip if same agent+event+ip in last 30 seconds
    if (event_type === 'view') {
      const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
      const { count } = await supabase
        .from("page_events")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent_id)
        .eq("event_type", "view")
        .eq("ip_hash", ipHash)
        .gt("created_at", thirtySecAgo);

      if (count && count > 0) {
        return new Response(JSON.stringify({ success: true, deduped: true }), { headers: CORS });
      }
    }

    const { error } = await supabase.from("page_events").insert({
      agent_id,
      event_type,
      metadata: metadata || {},
      referrer: referrer || null,
      user_agent: userAgent,
      ip_hash: ipHash,
    });

    if (error) {
      console.error("Insert event error:", error);
      return new Response(JSON.stringify({ error: "Failed to log event" }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (e) {
    console.error("log-event error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: CORS });
  }
});
