// ===========================================
// WEEKLY STATS EMAIL — SellingDubai
// ===========================================
// Scheduled function (call via cron weekly).
// Sends each active agent a summary of their
// profile views, WhatsApp taps, and leads
// from the past 7 days.
//
// GET or POST — no body needed
// Auth: CRON_SECRET query param or header
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escHtml, getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("weekly-stats", req);
  const _start = Date.now();
  const CORS = { ...getCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // Auth check
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret") || "";
    const authHeader = req.headers.get("authorization") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";

    if (!cronSecret) {
      log({ event: "auth_failed", status: 401 });
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured." }), { status: 401, headers: CORS });
    }

    const isAuthorized =
      querySecret === cronSecret ||
      authHeader === `Bearer ${cronSecret}` ||
      cronHeader === cronSecret;

    if (!isAuthorized) {
      log({ event: "auth_failed", status: 401 });
      return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: CORS });
    }

    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (!RESEND_KEY) {
      log({ event: "error", status: 500, error: "No RESEND_API_KEY configured." });
      return new Response(JSON.stringify({ error: "No RESEND_API_KEY configured." }), { status: 500, headers: CORS });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all active verified agents with email
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, email, slug")
      .eq("is_active", true)
      .eq("verification_status", "verified")
      .not("email", "is", null)
      .limit(500);

    if (agentsErr || !agents) {
      log({ event: "error", status: 500, error: "Failed to fetch agents." });
      return new Response(JSON.stringify({ error: "Failed to fetch agents." }), { status: 500, headers: CORS });
    }

    let sent = 0;
    const errors: string[] = [];

    // deno-lint-ignore no-explicit-any
    for (const agent of agents as any[]) {
      try {
        // Count views
        const { count: views } = await supabase
          .from("page_events")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .eq("event_type", "view")
          .gte("created_at", sevenDaysAgo);

        // Count WhatsApp taps
        const { count: waTaps } = await supabase
          .from("page_events")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .eq("event_type", "whatsapp_tap")
          .gte("created_at", sevenDaysAgo);

        // Count leads
        const { count: leads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id)
          .gte("created_at", sevenDaysAgo);

        const viewCount = views || 0;
        const waCount = waTaps || 0;
        const leadCount = leads || 0;

        // Skip if zero activity
        if (viewCount === 0 && waCount === 0 && leadCount === 0) continue;

        const profileUrl = `https://sellingdubai.ae/${agent.slug}`;
        const dashUrl = `https://sellingdubai.ae/dashboard`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <p style="font-size:11px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#999;margin:0;">SELLING DUBAI</p>
  </div>
  <div style="background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <h1 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px;">Your Weekly Recap</h1>
    <p style="font-size:14px;color:#666;margin:0 0 24px;">Hey ${escHtml(agent.name)}, here's how your profile performed this week.</p>
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#f8f9fa;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#111;">${viewCount}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Profile Views</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#22c55e;">${waCount}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">WhatsApp Taps</div>
      </div>
      <div style="flex:1;background:#eff6ff;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#3b82f6;">${leadCount}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Leads</div>
      </div>
    </div>
    ${leadCount > 0 ? `<p style="font-size:14px;color:#111;font-weight:600;margin:0 0 16px;">You got ${leadCount} new lead${leadCount > 1 ? "s" : ""} this week. Speed matters — agents who respond in under 5 minutes convert 21x more.</p>` : ""}
    <div style="text-align:center;margin-top:20px;">
      <a href="${dashUrl}" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">View Full Analytics</a>
    </div>
    <div style="text-align:center;margin-top:16px;">
      <a href="${profileUrl}" style="font-size:13px;color:#666;text-decoration:none;">Share your profile &rarr;</a>
    </div>
  </div>
  <p style="font-size:11px;color:#ccc;margin:24px 0 0;text-align:center;">&copy; 2026 SellingDubai.ae</p>
</div>
</body>
</html>`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM") || "SellingDubai <noreply@sellingdubai.ae>",
            to: [agent.email],
            subject: `${viewCount} views, ${leadCount} leads — Your Week on SellingDubai`,
            html: emailHtml,
          }),
        });

        sent++;
      } catch (_e) {
        errors.push(agent.slug);
      }
    }

    log({ event: "success", status: 200 });
    return new Response(
      JSON.stringify({ sent, total_agents: agents.length, errors: errors.slice(0, 10) }),
      { status: 200, headers: CORS },
    );
  } catch (e) {
    log({ event: "error", status: 500, error: String(e) });
    console.error("weekly-stats error");
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: CORS });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
