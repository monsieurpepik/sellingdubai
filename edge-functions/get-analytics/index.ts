import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

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

Deno.serve(async (req: Request) => {
  const log = createLogger('get-analytics', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), { status: 401, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("agent_id, used_at")
      .eq("token", token)
      .gt("expires_at", now)
      .is("revoked_at", null)
      .single();

    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: cors });
    }

    if (!link.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), { status: 401, headers: cors });
    }

    const agentId = link.agent_id;

    const today = new Date();
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = thisMonthStart;

    const { data: thisMonthEvents } = await supabase
      .from("page_events")
      .select("event_type, metadata, created_at")
      .eq("agent_id", agentId)
      .gte("created_at", thisMonthStart)
      .order("created_at", { ascending: false });

    const { data: lastMonthEvents } = await supabase
      .from("page_events")
      .select("event_type")
      .eq("agent_id", agentId)
      .gte("created_at", lastMonthStart)
      .lt("created_at", lastMonthEnd);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLeads } = await supabase
      .from("leads")
      .select("id, name, phone, email, budget_range, property_type, preferred_area, message, source, status, created_at")
      .eq("agent_id", agentId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    // Fetch referral stats
    const { data: referralData } = await supabase
      .from("referrals")
      .select("id, status")
      .eq("referrer_id", agentId);

    const referralStats = {
      invited: referralData ? referralData.length : 0,
      verified: referralData ? referralData.filter((r: { status: string }) => r.status === 'verified' || r.status === 'rewarded').length : 0,
    };

    const thisMonth: Record<string, number> = {};
    const dailyViews: Record<string, number> = {};
    const referrers: Record<string, number> = {};

    for (const e of (thisMonthEvents || [])) {
      thisMonth[e.event_type] = (thisMonth[e.event_type] || 0) + 1;
      if (e.event_type === 'view') {
        const day = e.created_at.slice(0, 10);
        dailyViews[day] = (dailyViews[day] || 0) + 1;
      }
      if (e.metadata && (e.metadata as Record<string, unknown>).referrer_source) {
        const src = (e.metadata as Record<string, unknown>).referrer_source as string;
        referrers[src] = (referrers[src] || 0) + 1;
      }
    }

    const lastMonth: Record<string, number> = {};
    for (const e of (lastMonthEvents || [])) {
      lastMonth[e.event_type] = (lastMonth[e.event_type] || 0) + 1;
    }

    const chartData: { date: string; views: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      chartData.push({ date: key, views: dailyViews[key] || 0 });
    }

    const topReferrers = Object.entries(referrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    log({ event: 'success', status: 200, agent_id: agentId });
    return new Response(JSON.stringify({
      this_month: {
        views: thisMonth['view'] || 0,
        whatsapp_taps: thisMonth['whatsapp_tap'] || 0,
        lead_submits: thisMonth['lead_submit'] || 0,
        link_clicks: thisMonth['link_click'] || 0,
        phone_taps: thisMonth['phone_tap'] || 0,
        shares: thisMonth['share'] || 0,
      },
      last_month: {
        views: lastMonth['view'] || 0,
        whatsapp_taps: lastMonth['whatsapp_tap'] || 0,
        lead_submits: lastMonth['lead_submit'] || 0,
        link_clicks: lastMonth['link_click'] || 0,
        phone_taps: lastMonth['phone_tap'] || 0,
        shares: lastMonth['share'] || 0,
      },
      chart: chartData,
      top_referrers: topReferrers,
      recent_leads: recentLeads || [],
      referral_stats: referralStats,
    }), { headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("get-analytics error");
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: getCorsHeaders(req) });
  } finally {
    log.flush(Date.now() - _start);
  }
});
