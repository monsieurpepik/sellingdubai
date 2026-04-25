// ===========================================
// LEAD NUDGER — SellingDubai
// ===========================================
// Cron function. Sends WhatsApp lifecycle nudges to agents:
//   Day 1 after signup: welcome + "add your first listing" link
//   Day 3 (profile <60%): "your profile is X% complete"
//   Day 7 (no listing): "add a property to start receiving leads"
//   Weekly: "you have N leads this week — M need follow-up"
//   Lead idle >5 days: "Hassan hasn't heard from you in 5 days"
//
// Auth: CRON_SECRET (query ?secret= or Authorization Bearer or x-cron-secret header)
// Returns: { sent: N, skipped: N, details: [...] }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

// ── Types ──

interface Agent {
  id: string;
  name: string;
  whatsapp: string | null;
  photo_url: string | null;
  tagline: string | null;
  verification_status: string | null;
  created_at: string;
  nudge_day1_sent_at: string | null;
  nudge_day3_sent_at: string | null;
  nudge_day7_sent_at: string | null;
  nudge_weekly_sent_at: string | null;
}

// ── Pure helpers (exported for tests) ──

/**
 * Normalises a WhatsApp number to the E.164-style digit string Meta expects.
 * Strips all non-digits, removes leading '00', prepends '971' if it looks like
 * a UAE local number (starts with 05x).
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // UAE mobile: 05x → 9715x
  if (digits.startsWith("05") && digits.length === 10) digits = "971" + digits.slice(1);
  return digits;
}

/**
 * Determines which nudge types an agent should receive right now.
 * Pure function — no side effects, no I/O. Tested directly.
 *
 * @param agent     The agent record from DB
 * @param listingCount  Number of active listings for this agent
 * @param nowMs     Current timestamp in milliseconds (injectable for tests)
 */
export function computeNudges(
  agent: Agent & { created_at: string },
  listingCount: number,
  nowMs: number = Date.now(),
): string[] {
  const nudges: string[] = [];
  const createdAt = new Date(agent.created_at).getTime();
  const ageMs = nowMs - createdAt;

  const DAY = 24 * 60 * 60 * 1000;

  // Day 1: joined < 24h ago, no day1 nudge sent yet
  if (ageMs < DAY && !agent.nudge_day1_sent_at) {
    nudges.push("day1");
  }

  // Day 3: joined > 2 days ago, profile incomplete, no day3 nudge sent
  if (ageMs > 2 * DAY) {
    const hasPhoto    = !!agent.photo_url;
    const hasBio      = !!(agent.tagline && agent.tagline.trim().length > 0);
    const hasWhatsapp = !!(agent.whatsapp && normalizePhone(agent.whatsapp).length >= 9);
    const hasListing  = listingCount > 0;
    const profileComplete = hasPhoto && hasBio && hasWhatsapp && hasListing;

    if (!profileComplete && !agent.nudge_day3_sent_at) {
      nudges.push("day3");
    }
  }

  // Day 7: joined > 6 days ago, still no listing, no day7 nudge sent
  if (ageMs > 6 * DAY && listingCount === 0 && !agent.nudge_day7_sent_at) {
    nudges.push("day7");
  }

  // Weekly: no weekly nudge sent yet, or last sent > 7 days ago
  if (!agent.nudge_weekly_sent_at) {
    nudges.push("weekly");
  } else {
    const lastWeekly = new Date(agent.nudge_weekly_sent_at).getTime();
    if (nowMs - lastWeekly > 7 * DAY) nudges.push("weekly");
  }

  return nudges;
}

// ── WhatsApp sender ──

async function sendWhatsApp(
  waToken: string,
  waPhoneId: string,
  to: string,
  body: string,
): Promise<boolean> {
  const phone = normalizePhone(to);
  if (!phone) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${waPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Message builders ──

const DASHBOARD_URL = "https://sellingdubai.com/dashboard";

function buildDay1Message(agentName: string): string {
  return `Hi ${agentName} 👋 Welcome to SellingDubai! Add your first property listing to start receiving enquiries from buyers: ${DASHBOARD_URL}`;
}

function buildDay3Message(agentName: string): string {
  return `Hi ${agentName}, your SellingDubai profile isn't complete yet. Agents with a photo, tagline, and listing get 3× more leads. It takes 2 minutes: ${DASHBOARD_URL}`;
}

function buildDay7Message(agentName: string): string {
  return `Hi ${agentName}, you still haven't added a property listing to SellingDubai. Listings are the #1 reason buyers contact agents on the platform: ${DASHBOARD_URL}`;
}

function buildWeeklyMessage(agentName: string, leadCount: number, uncontactedCount: number): string {
  if (leadCount === 0) {
    return `Hi ${agentName}, your SellingDubai weekly summary: no new leads this week. Share your profile link to get started: ${DASHBOARD_URL}`;
  }
  if (uncontactedCount > 0) {
    return `Hi ${agentName}, your SellingDubai weekly summary: ${leadCount} lead${leadCount !== 1 ? "s" : ""} this week — ${uncontactedCount} still need${uncontactedCount === 1 ? "s" : ""} follow-up: ${DASHBOARD_URL}`;
  }
  return `Hi ${agentName}, your SellingDubai weekly summary: ${leadCount} lead${leadCount !== 1 ? "s" : ""} this week. Great work! ${DASHBOARD_URL}`;
}

function buildIdleLeadMessage(agentName: string, leadName: string, daysIdle: number): string {
  return `Hi ${agentName}, ${leadName} enquired ${daysIdle} days ago on SellingDubai and hasn't heard back. Speed-to-lead matters: ${DASHBOARD_URL}`;
}

// ── CORS ──

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, x-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ── Handler ──

Deno.serve(async (req: Request) => {
  const log = createLogger('lead-nudger', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Auth
    const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("cron_secret") || "";
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured." }), { status: 401, headers: cors });
    }
    const url = new URL(req.url);
    const isAuthorized =
      url.searchParams.get("secret") === cronSecret ||
      req.headers.get("authorization") === `Bearer ${cronSecret}` ||
      req.headers.get("x-cron-secret") === cronSecret;

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const WA_TOKEN    = Deno.env.get("WA_TOKEN") || "";
    const WA_PHONE_ID = Deno.env.get("WA_PHONE_ID") || "";

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    const details: string[] = [];

    // ── 1. Lifecycle nudges (Day 1, 3, 7, weekly) ──

    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, whatsapp, photo_url, tagline, verification_status, created_at, nudge_day1_sent_at, nudge_day3_sent_at, nudge_day7_sent_at, nudge_weekly_sent_at")
      .not("whatsapp", "is", null)
      .gte("created_at", eightDaysAgo)
      .eq("is_active", true)
      .limit(200);

    if (agentsErr) {
      log({ event: 'error', status: 500, error: 'agents query error' });
      return new Response(JSON.stringify({ error: "Failed to query agents." }), { status: 500, headers: cors });
    }

    for (const agent of (agents || []) as Agent[]) {
      const { count: listingCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .eq("is_active", true);

      const nudgesToSend = computeNudges(agent, listingCount ?? 0, now);

      for (const nudgeType of nudgesToSend) {
        let message = "";
        let updateField = "";

        if (nudgeType === "day1") {
          message = buildDay1Message(agent.name);
          updateField = "nudge_day1_sent_at";
        } else if (nudgeType === "day3") {
          message = buildDay3Message(agent.name);
          updateField = "nudge_day3_sent_at";
        } else if (nudgeType === "day7") {
          message = buildDay7Message(agent.name);
          updateField = "nudge_day7_sent_at";
        } else if (nudgeType === "weekly") {
          const { count: weekLeads } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .gte("created_at", sevenDaysAgo);

          const { count: uncontacted } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .gte("created_at", sevenDaysAgo)
            .is("contacted_at", null);

          message = buildWeeklyMessage(agent.name, weekLeads ?? 0, uncontacted ?? 0);
          updateField = "nudge_weekly_sent_at";
        }

        if (!message) continue;

        if (WA_TOKEN && WA_PHONE_ID && agent.whatsapp) {
          const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
          if (ok) {
            await supabase.from("agents").update({ [updateField]: nowIso }).eq("id", agent.id);
            sent++;
            details.push(`${nudgeType}:${agent.id}`);
          } else {
            skipped++;
          }
        } else {
          console.warn(`lead-nudger: WA credentials missing, skipping ${nudgeType} for ${agent.id}`);
          skipped++;
        }
      }
    }

    // ── 2. Weekly nudge also runs for older agents ──
    const { data: olderAgents } = await supabase
      .from("agents")
      .select("id, name, whatsapp, photo_url, tagline, verification_status, created_at, nudge_day1_sent_at, nudge_day3_sent_at, nudge_day7_sent_at, nudge_weekly_sent_at")
      .not("whatsapp", "is", null)
      .lt("created_at", eightDaysAgo)
      .eq("is_active", true)
      .or(`nudge_weekly_sent_at.is.null,nudge_weekly_sent_at.lt.${sevenDaysAgo}`)
      .limit(200);

    for (const agent of (olderAgents || []) as Agent[]) {
      const { count: weekLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .gte("created_at", sevenDaysAgo);

      const { count: uncontacted } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .gte("created_at", sevenDaysAgo)
        .is("contacted_at", null);

      const message = buildWeeklyMessage(agent.name, weekLeads ?? 0, uncontacted ?? 0);

      if (WA_TOKEN && WA_PHONE_ID && agent.whatsapp) {
        const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
        if (ok) {
          await supabase.from("agents").update({ nudge_weekly_sent_at: nowIso }).eq("id", agent.id);
          sent++;
          details.push(`weekly:${agent.id}`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    // ── 3. Lead idle nudges (> 5 days old, not contacted) ──

    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data: idleLeads } = await supabase
      .from("leads")
      .select("id, name, created_at, agent_id, agents!inner(id, name, whatsapp)")
      .lt("created_at", fiveDaysAgo)
      .is("contacted_at", null)
      .is("idle_nudge_sent_at", null)
      .eq("archived", false)
      .limit(100);

    type IdleLead = { id: string; name: string; created_at: string; agent_id: string; agents: { id: string; name: string; whatsapp: string | null } };
    for (const lead of (idleLeads || []) as unknown as IdleLead[]) {
      const agent = lead.agents;
      if (!agent?.whatsapp) continue;

      const daysIdle = Math.floor((now - new Date(lead.created_at).getTime()) / (24 * 60 * 60 * 1000));
      const message = buildIdleLeadMessage(agent.name, lead.name || "Your lead", daysIdle);

      if (WA_TOKEN && WA_PHONE_ID) {
        const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
        if (ok) {
          await supabase.from("leads").update({ idle_nudge_sent_at: nowIso }).eq("id", lead.id);
          sent++;
          details.push(`idle:${lead.id}`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    log({ event: 'success', status: 200, sent, skipped });
    return new Response(
      JSON.stringify({ sent, skipped, details }),
      { status: 200, headers: cors },
    );
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors },
    );
  } finally {
    log.flush(Date.now() - _start);
  }
});
