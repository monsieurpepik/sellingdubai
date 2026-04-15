// ===========================================
// LEAD QUALITY FOLLOWUP — SellingDubai
// ===========================================
// Called by pg_cron every 30 minutes.
// Finds leads where quality_followup_due_at <= now()
// and quality_rating IS NULL and quality_followup_sent_at IS NULL,
// then sends an interactive WhatsApp button message to the agent asking
// "Was [buyer name] a good lead?"
//
// Button IDs: quality_1_<lead_id> = yes (good lead, rating 1)
//             quality_2_<lead_id> = no  (not qualified, rating 2)
// Handler for these button replies lives in whatsapp-ingest/index.ts.
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const WA_API_VERSION = "v18.0";

async function sendQualityButtonMessage(
  to: string,
  leadId: string,
  buyerName: string,
  agoStr: string,
  waToken: string,
  waPhoneId: string,
): Promise<boolean> {
  const bodyText = `Quick question — was *${buyerName.slice(0, 60)}* a good lead? (${agoStr})`;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${waPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: { id: `quality_1_${leadId}`, title: "Yes — genuine buyer" },
                },
                {
                  type: "reply",
                  reply: { id: `quality_2_${leadId}`, title: "No — not qualified" },
                },
              ],
            },
          },
        }),
      },
    );
    return res.ok;
  } catch (_e) {
    return false;
  }
}

function agoString(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

Deno.serve(async (req) => {
  const log = createLogger("lead-quality-followup", req);
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

  // Find leads due for quality follow-up (up to 50 at a time)
  const now = new Date().toISOString();
  const { data: pending, error } = await supabase
    .from("leads")
    .select("id, name, created_at, agents(whatsapp)")
    .lte("quality_followup_due_at", now)
    .is("quality_rating", null)
    .is("quality_followup_sent_at", null)
    .not("quality_followup_due_at", "is", null)
    .limit(50);

  if (error) {
    log({ event: "query_error", status: 500, error: String(error) });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500 });
  }

  if (!pending || pending.length === 0) {
    log({ event: "no_pending", status: 200 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let sent = 0;
  const sentIds: string[] = [];

  for (const lead of pending) {
    // deno-lint-ignore no-explicit-any
    const agentWa = (lead.agents as any)?.whatsapp as string | null;
    if (!agentWa) continue;

    const to = agentWa.replace(/[^0-9]/g, "");
    if (!to || to.length < 7) continue;

    const ok = await sendQualityButtonMessage(
      to,
      lead.id,
      lead.name ?? "the lead",
      agoString(lead.created_at),
      WA_TOKEN,
      WA_PHONE_ID,
    );

    if (ok) {
      sentIds.push(lead.id);
      sent++;
    }
  }

  // Mark all successfully sent leads so we don't retry
  if (sentIds.length > 0) {
    await supabase
      .from("leads")
      .update({ quality_followup_sent_at: new Date().toISOString() })
      .in("id", sentIds);
  }

  log({ event: "done", sent, status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify({ processed: sent }), { status: 200 });
});
