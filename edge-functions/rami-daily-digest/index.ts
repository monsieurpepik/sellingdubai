// ===========================================
// RAMI DAILY DIGEST — SellingDubai
// ===========================================
// Called by pg_cron every day at 05:00 UTC (09:00 Dubai/UTC+4).
// Finds each active verified agent's cold leads (uncontacted, created 24h+ ago)
// and sends a morning digest via WhatsApp.
//
// "Cold lead" = status IN ('new', null) AND created_at < 24h ago AND NOT archived.
// Digest is skipped if the agent has no cold leads.
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const WA_API_VERSION = "v18.0";

async function sendWhatsAppText(
  to: string,
  text: string,
  waToken: string,
  waPhoneId: string,
): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${waPhoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
  } catch (_e) { /* send failure is non-fatal */ }
}

function dubaiFriendlyTime(isoString: string): string {
  return new Date(isoString).toLocaleString("en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

Deno.serve(async (req) => {
  const log = createLogger("rami-daily-digest", req);
  const _start = Date.now();

  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!WA_TOKEN || !WA_PHONE_ID) {
    log({ event: "skipped", reason: "no_wa_creds", status: 200 });
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Cold leads are those created more than 24 hours ago and still uncontacted
  const coldThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Pull cold leads with agent join — limit to 500 per run to stay within function budget
  const { data: coldLeads, error: leadsErr } = await supabase
    .from("leads")
    .select("agent_id, name, phone, email, preferred_area, property_type, created_at")
    .or("status.eq.new,status.is.null")
    .lt("created_at", coldThreshold)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(500);

  if (leadsErr) {
    log({ event: "leads_query_error", status: 500, error: String(leadsErr) });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
  }

  if (!coldLeads || coldLeads.length === 0) {
    log({ event: "no_cold_leads", status: 200 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Group by agent
  const byAgent = new Map<string, typeof coldLeads>();
  for (const lead of coldLeads) {
    if (!byAgent.has(lead.agent_id)) byAgent.set(lead.agent_id, []);
    byAgent.get(lead.agent_id)!.push(lead);
  }

  // Fetch active verified agents with WhatsApp who have cold leads
  const agentIds = [...byAgent.keys()];
  const { data: agents, error: agentsErr } = await supabase
    .from("agents")
    .select("id, name, whatsapp")
    .in("id", agentIds)
    .eq("is_active", true)
    .eq("verification_status", "verified")
    .not("whatsapp", "is", null);

  if (agentsErr || !agents) {
    log({ event: "agents_query_error", status: 500 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "agents query failed" }), { status: 500 });
  }

  let sent = 0;

  for (const agent of agents) {
    const leads = byAgent.get(agent.id) ?? [];
    if (leads.length === 0) continue;

    const to = agent.whatsapp.replace(/[^0-9]/g, "");
    if (!to || to.length < 7) continue;

    // Build digest message — show up to 5 leads, summarise the rest
    const shown = leads.slice(0, 5);
    const overflow = leads.length - shown.length;

    const leadLines = shown.map((l, i) => {
      const contact = l.phone || l.email || "—";
      const area = l.preferred_area ? ` · ${l.preferred_area}` : "";
      const type = l.property_type ? ` · ${l.property_type}` : "";
      const time = dubaiFriendlyTime(l.created_at);
      return `${i + 1}. *${l.name || "Unnamed"}*\n   📞 ${contact}${area}${type}\n   🕐 ${time}`;
    });

    if (overflow > 0) {
      leadLines.push(`_...and ${overflow} more. Text *LEADS* to see all._`);
    }

    const lines = [
      `🌅 *Good morning, ${agent.name.split(" ")[0]}!*`,
      ``,
      `You have *${leads.length}* cold lead${leads.length !== 1 ? "s" : ""} waiting for follow-up:`,
      ``,
      ...leadLines,
      ``,
      `Reply *LEADS* for today's full list, or text a lead's name to pull up their details.`,
    ];

    await sendWhatsAppText(to, lines.join("\n"), WA_TOKEN, WA_PHONE_ID);
    sent++;
  }

  log({ event: "done", sent, total_agents: agents.length, status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify({ sent }), { status: 200 });
});
