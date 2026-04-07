import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ao = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

interface AgentStats {
  agent_id: string;
  name: string;
  slug: string;
  photo_url: string | null;
  views_this_month: number;
  views_last_month: number;
  leads_this_month: number;
  leads_last_month: number;
  leads_all_time: number;
  wa_taps_this_month: number;
  properties_active: number;
}

async function statsForAgent(
  agentId: string,
  name: string,
  slug: string,
  photo_url: string | null,
  thisMonthStart: string,
  lastMonthStart: string,
  lastMonthEnd: string,
  // deno-lint-ignore no-explicit-any
  sb: any,
): Promise<AgentStats> {
  const [vTM, vLM, lTM, lLM, lAll, waTM, props] = await Promise.allSettled([
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "view").gte("created_at", thisMonthStart),
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "view").gte("created_at", lastMonthStart).lt("created_at", lastMonthEnd),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId).gte("created_at", thisMonthStart),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId).gte("created_at", lastMonthStart).lt("created_at", lastMonthEnd),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "whatsapp_tap").gte("created_at", thisMonthStart),
    sb.from("properties").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("is_active", true),
  ]);
  // deno-lint-ignore no-explicit-any
  const c = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? (r.value.count ?? 0) : 0;
  return { agent_id: agentId, name, slug, photo_url, views_this_month: c(vTM), views_last_month: c(vLM), leads_this_month: c(lTM), leads_last_month: c(lLM), leads_all_time: c(lAll), wa_taps_this_month: c(waTM), properties_active: c(props) };
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("agency-stats", req);
  const _start = Date.now();
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON." }), { status: 400, headers: cors }); }

  const { token } = body;
  if (!token || typeof token !== "string") return new Response(JSON.stringify({ error: "Missing token." }), { status: 401, headers: cors });

  const sb = _createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link, error: linkErr } = await sb.from("magic_links").select("agent_id, expires_at, used_at").eq("token", token).single();
  if (linkErr && linkErr.code !== "PGRST116") {
    return new Response(JSON.stringify({ error: "Internal error." }), { status: 500, headers: cors });
  }
  if (!link || new Date(link.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });
  if (!link.used_at) return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), { status: 401, headers: cors });
  const agentId: string = link.agent_id;

  const { data: agency, error: agencyErr } = await sb.from("agencies").select("id, name, slug, logo_url").eq("owner_agent_id", agentId).maybeSingle();
  if (agencyErr) return new Response(JSON.stringify({ error: "Internal error." }), { status: 500, headers: cors });
  if (!agency) return new Response(JSON.stringify({ error: "No agency found for this account." }), { status: 403, headers: cors });

  const { data: members, error: membersErr } = await sb.from("agents").select("id, name, slug, photo_url").eq("agency_id", agency.id);
  if (membersErr) return new Response(JSON.stringify({ error: "Internal error." }), { status: 500, headers: cors });
  if (!members || members.length === 0) {
    const empty = { views_this_month: 0, views_last_month: 0, leads_this_month: 0, leads_last_month: 0, leads_all_time: 0, wa_taps_this_month: 0, properties_active: 0 };
    return new Response(JSON.stringify({ agency, agents: [], totals: empty }), { headers: cors });
  }

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = thisMonthStart;

  const settledStats = await Promise.allSettled(
    // deno-lint-ignore no-explicit-any
    members.map((m: any) => statsForAgent(m.id, m.name, m.slug, m.photo_url, thisMonthStart, lastMonthStart, lastMonthEnd, sb))
  );
  const agentStats: AgentStats[] = settledStats
    .filter((r): r is PromiseFulfilledResult<AgentStats> => r.status === "fulfilled")
    .map(r => r.value);

  const sum = (key: keyof AgentStats) => agentStats.reduce((acc: number, a: AgentStats) => acc + (a[key] as number), 0);
  const totals = {
    views_this_month: sum("views_this_month"),
    views_last_month: sum("views_last_month"),
    leads_this_month: sum("leads_this_month"),
    leads_last_month: sum("leads_last_month"),
    leads_all_time: sum("leads_all_time"),
    wa_taps_this_month: sum("wa_taps_this_month"),
    properties_active: sum("properties_active"),
    agents_count: members.length,
  };

  log({ event: "success", agent_id: agentId, status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify({ agency, agents: agentStats, totals }), { headers: cors });
}

Deno.serve((req) => handler(req));
