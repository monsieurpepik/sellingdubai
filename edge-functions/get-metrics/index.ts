// edge-functions/get-metrics/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPS_SECRET = Deno.env.get("OPS_SECRET") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // Auth: require OPS_SECRET in Authorization header
  if (!OPS_SECRET) {
    return new Response(JSON.stringify({ error: "OPS_SECRET not configured." }), {
      status: 503, headers: CORS_HEADERS,
    });
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${OPS_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401, headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Tier breakdown ──────────────────────────────────────────────────────────
  const { data: tierRows } = await supabase
    .from("agents")
    .select("tier")
    .eq("verified", true);

  const tierCounts: Record<string, number> = { free: 0, pro: 0, premium: 0 };
  for (const row of tierRows ?? []) {
    const t = row.tier ?? "free";
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  // ── MRR (AED) ───────────────────────────────────────────────────────────────
  const { data: billingRows } = await supabase
    .from("agents")
    .select("tier_price")
    .eq("verified", true)
    .neq("tier", "free");

  const mrr = (billingRows ?? []).reduce((sum, r) => sum + (Number(r.tier_price) || 0), 0);
  const arr = mrr * 12;

  // ── Agent counts this month vs last month (for MoM growth %) ────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const { count: totalAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true);

  const { count: thisMonthAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true)
    .gte("created_at", thisMonthStart);

  const { count: lastMonthAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true)
    .gte("created_at", lastMonthStart)
    .lt("created_at", thisMonthStart);

  const momGrowthPct = lastMonthAgents && lastMonthAgents > 0
    ? Math.round(((thisMonthAgents ?? 0) - lastMonthAgents) / lastMonthAgents * 100)
    : null;

  // ── Activation rate: agents with ≥1 property / total verified ───────────────
  const { data: agentIds } = await supabase
    .from("agents")
    .select("id")
    .eq("verified", true);

  let activatedCount = 0;
  if (agentIds && agentIds.length > 0) {
    const ids = agentIds.map((a: { id: string }) => a.id);
    const { data: activeAgents } = await supabase
      .from("properties")
      .select("agent_id")
      .in("agent_id", ids)
      .eq("status", "active");

    const uniqueActive = new Set((activeAgents ?? []).map((p: { agent_id: string }) => p.agent_id));
    activatedCount = uniqueActive.size;
  }

  const activationRate = totalAgents
    ? Math.round((activatedCount / (totalAgents || 1)) * 100)
    : 0;

  // ── Agent funnel ─────────────────────────────────────────────────────────────
  const { count: totalJoined } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true });

  const totalVerified = totalAgents ?? 0;
  const agentsWithProperty = activatedCount;

  const { data: leadAgentRows } = await supabase
    .from("leads")
    .select("agent_id");
  const agentsWithLead = new Set((leadAgentRows ?? []).map((l: { agent_id: string }) => l.agent_id)).size;

  const paid = (tierCounts["pro"] ?? 0) + (tierCounts["premium"] ?? 0);

  // ── Lead volume — last 30 days, grouped by day ───────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  const leadsByDay: Record<string, number> = {};
  for (const lead of recentLeads ?? []) {
    const day = (lead.created_at as string).slice(0, 10);
    leadsByDay[day] = (leadsByDay[day] ?? 0) + 1;
  }

  const leadSeries: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    leadSeries.push({ date: dateStr, count: leadsByDay[dateStr] ?? 0 });
  }

  // ── Churn: tier downgrades in last 30 days ───────────────────────────────────
  const { count: churned } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("tier", "free")
    .eq("stripe_subscription_status", "canceled")
    .gte("updated_at", thirtyDaysAgo);

  const metrics = {
    mrr,
    arr,
    mom_growth_pct: momGrowthPct,
    tier_breakdown: tierCounts,
    funnel: {
      joined: totalJoined ?? 0,
      verified: totalVerified,
      with_property: agentsWithProperty,
      with_lead: agentsWithLead,
      paid,
    },
    activation_rate_pct: activationRate,
    lead_series: leadSeries,
    total_leads_30d: (recentLeads ?? []).length,
    churn_30d: churned ?? 0,
    generated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(metrics), {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "max-age=300, s-maxage=300",
    },
  });
});
