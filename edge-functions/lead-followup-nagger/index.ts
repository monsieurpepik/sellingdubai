// ===========================================
// LEAD FOLLOW-UP NAGGER — SellingDubai
// ===========================================
// Scheduled function (call via cron or manual trigger).
// Finds leads older than 30 minutes where the agent
// hasn't been re-notified, and sends a reminder email.
//
// Designed to be called every 15 minutes via:
//   - Supabase pg_cron
//   - External cron (e.g., cron-job.org hitting the endpoint)
//   - Manual trigger
//
// GET or POST — no body needed
// Returns { reminded: N, leads: [...] }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Escape HTML to prevent XSS in email templates
function escHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Auth: check query param OR Authorization header against CRON_SECRET (both casings)
    const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("cron_secret") || "";
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret") || "";
    const authHeader = req.headers.get("authorization") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";

    if (!cronSecret) {
      return new Response(
        JSON.stringify({ error: "CRON_SECRET not configured." }),
        { status: 401, headers: cors }
      );
    }

    const isAuthorized =
      querySecret === cronSecret ||
      authHeader === `Bearer ${cronSecret}` ||
      cronHeader === cronSecret;

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: cors }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find leads from the last 24 hours that:
    // 1. Are older than 30 minutes
    // 2. Haven't had a followup nag sent yet (followup_nagged_at IS NULL)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("*, agents!inner(id, name, email, slug, whatsapp)")
      .lt("created_at", thirtyMinAgo)
      .gt("created_at", twentyFourHoursAgo)
      .is("followup_nagged_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (leadsErr) {
      console.error("Query error:", leadsErr);
      return new Response(
        JSON.stringify({ error: "Failed to query leads.", detail: leadsErr.message }),
        { status: 500, headers: cors }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ reminded: 0, message: "No leads need follow-up reminders." }),
        { status: 200, headers: cors }
      );
    }

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const reminded: string[] = [];

    for (const lead of leads) {
      const agent = lead.agents;
      if (!agent?.email) continue;

      // Build WhatsApp deep link
      const waPhone = (lead.phone || "").replace(/[^0-9]/g, "");
      const waMsg = encodeURIComponent(
        `Hi ${lead.name}, thanks for reaching out about Dubai properties! I'm ${agent.name} from SellingDubai. How can I help?`
      );
      const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : "";

      // Send reminder email
      if (RESEND_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: Deno.env.get("RESEND_FROM") || "SellingDubai <noreply@sellingdubai.ae>",
              to: [agent.email],
              subject: `⏰ Follow up with ${(lead.name || '').substring(0, 100)} — 30+ min waiting`,
              html: `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <h2 style="font-size:12px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#666;">SELLING DUBAI</h2>
                  </div>
                  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:12px;padding:16px;margin-bottom:24px;">
                    <p style="font-size:14px;color:#856404;font-weight:600;margin:0;">
                      ⏰ ${escHtml(lead.name)} has been waiting 30+ minutes for a response.
                    </p>
                  </div>
                  <h1 style="font-size:20px;font-weight:700;color:#111;margin-bottom:16px;">Quick reminder, ${escHtml(agent.name)}</h1>
                  <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px;">
                    Speed-to-lead matters. Agents who respond within 5 minutes are <strong>21x more likely</strong> to convert. Don't let this one go cold.
                  </p>
                  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                    <tr><td style="padding:8px 0;color:#999;font-size:13px;">Name</td><td style="padding:8px 0;font-weight:600;font-size:14px;">${escHtml(lead.name)}</td></tr>
                    ${lead.phone ? `<tr><td style="padding:8px 0;color:#999;font-size:13px;">Phone</td><td style="padding:8px 0;font-weight:600;font-size:14px;"><a href="tel:${escHtml(lead.phone)}" style="color:#111;">${escHtml(lead.phone)}</a></td></tr>` : ""}
                    ${lead.email ? `<tr><td style="padding:8px 0;color:#999;font-size:13px;">Email</td><td style="padding:8px 0;font-weight:600;font-size:14px;"><a href="mailto:${escHtml(lead.email)}" style="color:#111;">${escHtml(lead.email)}</a></td></tr>` : ""}
                    ${lead.budget_range ? `<tr><td style="padding:8px 0;color:#999;font-size:13px;">Budget</td><td style="padding:8px 0;font-weight:600;font-size:14px;">${escHtml(lead.budget_range)}</td></tr>` : ""}
                    ${lead.property_type ? `<tr><td style="padding:8px 0;color:#999;font-size:13px;">Type</td><td style="padding:8px 0;font-weight:600;font-size:14px;">${escHtml(lead.property_type)}</td></tr>` : ""}
                  </table>
                  <div style="text-align:center;">
                    ${waLink ? `<a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:12px;">WhatsApp ${escHtml(lead.name)} Now</a><br>` : ""}
                    ${lead.phone ? `<a href="tel:${escHtml(lead.phone)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;margin-top:8px;">Call ${escHtml(lead.name)}</a>` : ""}
                  </div>
                  <p style="font-size:12px;color:#ccc;margin-top:32px;text-align:center;">
                    &copy; 2026 SellingDubai.ae
                  </p>
                </div>
              `,
            }),
          });
        } catch (emailErr) {
          console.error(`Failed to nag for lead ${lead.id}:`, emailErr);
        }
      }

      // Mark as nagged
      await supabase
        .from("leads")
        .update({ followup_nagged_at: new Date().toISOString() })
        .eq("id", lead.id);

      reminded.push(lead.name);
    }

    return new Response(
      JSON.stringify({ reminded: reminded.length, leads: reminded }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    console.error("lead-followup-nagger error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  }
});
