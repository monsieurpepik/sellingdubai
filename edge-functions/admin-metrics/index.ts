import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

/**
 * admin-metrics
 * Returns retention cohorts, conversion rates, and growth metrics.
 * Protected by CRON_SECRET (not user-facing).
 *
 * GET /admin-metrics
 * Headers: Authorization: Bearer <CRON_SECRET>
 *
 * Returns:
 * {
 *   total_agents, verified_agents, paid_agents,
 *   free_to_paid_rate,
 *   retention: { d7, d30, d90 },
 *   cohorts: [ { month, signups, active_7d, active_30d, paid } ],
 *   recent_signups_7d, recent_leads_7d,
 *   tier_breakdown: { free, pro, premium },
 *   mrr_aed
 * }
 */

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("admin-metrics", req);
  const _start = Date.now();

  // Auth via CRON_SECRET
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const d7ago = new Date(now.getTime() - 7 * 86400000).toISOString();
    const d30ago = new Date(now.getTime() - 30 * 86400000).toISOString();
    const d90ago = new Date(now.getTime() - 90 * 86400000).toISOString();

    // Fetch all agents with key fields
    const { data: agents } = await supabase
      .from("agents")
      .select("id, tier, verification_status, created_at, last_active_at, stripe_plan, stripe_subscription_status")
      .eq("is_active", true);

    const allAgents = agents || [];
    const total = allAgents.length;
    const verified = allAgents.filter((a: { verification_status: string }) => a.verification_status === "verified").length;
    const paid = allAgents.filter((a: { tier: string }) => a.tier === "pro" || a.tier === "premium").length;

    // Tier breakdown
    const tierBreakdown = { free: 0, pro: 0, premium: 0 };
    for (const a of allAgents) {
      const t = (a as { tier: string }).tier || "free";
      if (t in tierBreakdown) tierBreakdown[t as keyof typeof tierBreakdown]++;
      else tierBreakdown.free++;
    }

    // MRR estimate (AED)
    const mrr = tierBreakdown.pro * 299 + tierBreakdown.premium * 799;

    // Retention: % of agents active in last N days (who signed up before that window)
    function retentionRate(daysAgo: string): number {
      const eligible = allAgents.filter((a: { created_at: string }) => a.created_at < daysAgo);
      if (eligible.length === 0) return 0;
      const active = eligible.filter((a: { last_active_at: string | null }) =>
        a.last_active_at && a.last_active_at >= daysAgo
      );
      return Math.round((active.length / eligible.length) * 100);
    }

    const retention = {
      d7: retentionRate(d7ago),
      d30: retentionRate(d30ago),
      d90: retentionRate(d90ago),
    };

    // Free → Paid conversion rate
    const freeVerified = allAgents.filter((a: { tier: string; verification_status: string }) =>
      a.verification_status === "verified"
    ).length;
    const freeToPaid = freeVerified > 0 ? Math.round((paid / freeVerified) * 100) : 0;

    // Monthly cohorts (last 6 months)
    const cohorts: Array<{ month: string; signups: number; active_7d: number; active_30d: number; paid: number }> = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthStr = monthStart.toISOString().slice(0, 7); // YYYY-MM

      const cohort = allAgents.filter((a: { created_at: string }) =>
        a.created_at >= monthStart.toISOString() && a.created_at < monthEnd.toISOString()
      );

      const active7 = cohort.filter((a: { last_active_at: string | null }) =>
        a.last_active_at && a.last_active_at >= d7ago
      ).length;
      const active30 = cohort.filter((a: { last_active_at: string | null }) =>
        a.last_active_at && a.last_active_at >= d30ago
      ).length;
      const paidInCohort = cohort.filter((a: { tier: string }) =>
        a.tier === "pro" || a.tier === "premium"
      ).length;

      cohorts.push({ month: monthStr, signups: cohort.length, active_7d: active7, active_30d: active30, paid: paidInCohort });
    }

    // Recent activity
    const recentSignups = allAgents.filter((a: { created_at: string }) => a.created_at >= d7ago).length;

    const { count: recentLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", d7ago);

    const result = {
      total_agents: total,
      verified_agents: verified,
      paid_agents: paid,
      free_to_paid_rate: freeToPaid,
      retention,
      cohorts,
      tier_breakdown: tierBreakdown,
      mrr_aed: mrr,
      recent_signups_7d: recentSignups,
      recent_leads_7d: recentLeads ?? 0,
    };

    log({ event: "success", status: 200 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    log({ event: "error", status: 500, error: String(e) });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

Deno.serve((req) => handler(req));
