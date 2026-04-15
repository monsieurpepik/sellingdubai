// ===========================================
// WEEKLY PERFORMANCE REPORT — SellingDubai
// ===========================================
// Called by pg_cron every Monday 05:00 UTC (09:00 Dubai/UTC+4).
// Sends each active agent with a WhatsApp number a 7-day performance
// summary via WhatsApp text message.
//
// Stats included:
//   - Leads captured this week
//   - Leads marked good (quality_rating = 1)
//   - Leads you responded to (status = 'contacted')
//   - Top enquiry area
//   - Top property type
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

// Return the most common non-null value in an array, or null if empty
function topValue(arr: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of arr) {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Dubai week number (simple ISO week)
function weekLabel(): string {
  const now = new Date();
  return now.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
  });
}

Deno.serve(async (req) => {
  const log = createLogger("weekly-performance-report", req);
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull all leads from the last 7 days with agent join
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("agent_id, preferred_area, property_type, quality_rating, status")
    .gt("created_at", sevenDaysAgo);

  if (leadsErr) {
    log({ event: "leads_query_error", status: 500, error: String(leadsErr) });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
  }

  if (!leads || leads.length === 0) {
    log({ event: "no_leads_this_week", status: 200 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Group leads by agent_id
  const byAgent = new Map<string, typeof leads>();
  for (const lead of leads) {
    if (!byAgent.has(lead.agent_id)) byAgent.set(lead.agent_id, []);
    byAgent.get(lead.agent_id)!.push(lead);
  }

  // Fetch active agents that have WhatsApp and are in our lead set
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
  const label = weekLabel();

  for (const agent of agents) {
    const agentLeads = byAgent.get(agent.id) ?? [];
    if (agentLeads.length === 0) continue;

    const total = agentLeads.length;
    const goodLeads = agentLeads.filter((l) => l.quality_rating === 1).length;
    const responded = agentLeads.filter((l) => l.status === "contacted").length;
    const topArea = topValue(agentLeads.map((l) => l.preferred_area));
    const topType = topValue(agentLeads.map((l) => l.property_type));

    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    const goodRate = total > 0 ? Math.round((goodLeads / total) * 100) : 0;

    const lines: string[] = [
      `📊 *Weekly Report — w/e ${label}*`,
      ``,
      `*Leads captured:* ${total}`,
      `*Responded to:* ${responded} (${responseRate}%)`,
      goodLeads > 0 ? `*Good leads:* ${goodLeads} (${goodRate}% quality)` : `*Good leads:* none rated yet`,
      topArea ? `*Top area:* ${topArea}` : null,
      topType ? `*Top enquiry:* ${topType}` : null,
      ``,
      `Keep it up! 💪 Reply *HELP* for commands.`,
    ].filter((l) => l !== null) as string[];

    const to = agent.whatsapp.replace(/[^0-9]/g, "");
    if (!to || to.length < 7) continue;

    await sendWhatsAppText(to, lines.join("\n"), WA_TOKEN, WA_PHONE_ID);
    sent++;
  }

  log({ event: "done", sent, total_agents: agents.length, status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify({ sent }), { status: 200 });
});
