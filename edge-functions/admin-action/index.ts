// admin-action — Admin-only reads and mutations for the SellingDubai admin panel.
//
// All requests must include:   Authorization: Bearer <ADMIN_TOKEN>
// Every mutation is written to admin_audit_log with a SHA-256 hash of the token.
// The raw ADMIN_TOKEN is never stored or logged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

// deno-lint-ignore no-explicit-any
type SB = any;

async function logAudit(
  sb: SB,
  action: string,
  tokenHash: string,
  targetAgentId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await sb.from("admin_audit_log").insert({
    action,
    target_agent_id: targetAgentId ?? null,
    admin_token_hash: tokenHash,
    details,
  });
}

// ─── Action handlers ────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function getOverview(sb: SB): Promise<Response> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [agents, agentsThisMonth, leads, leadsThisMonth, activeProps, recentSignups] =
    await Promise.allSettled([
      sb.from("agents").select("id", { count: "exact", head: true }),
      sb.from("agents").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart),
      sb.from("leads").select("id", { count: "exact", head: true }),
      sb.from("leads").select("id", { count: "exact", head: true }).gte("created_at", thisMonthStart),
      sb.from("properties").select("id", { count: "exact", head: true }).eq("is_active", true),
      sb.from("agents")
        .select("id, name, email, created_at, tier")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  // deno-lint-ignore no-explicit-any
  const c = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? (r.value.count ?? 0) : 0;
  // deno-lint-ignore no-explicit-any
  const d = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? (r.value.data ?? []) : [];

  return json({
    total_agents: c(agents),
    agents_this_month: c(agentsThisMonth),
    total_leads: c(leads),
    leads_this_month: c(leadsThisMonth),
    active_properties: c(activeProps),
    recent_signups: d(recentSignups),
  });
}

// deno-lint-ignore no-explicit-any
async function getAgents(sb: SB, params: Record<string, any>): Promise<Response> {
  const { search, plan, page = 0, limit = 50 } = params;
  const offset = (page as number) * (limit as number);

  let q = sb
    .from("agents")
    .select("id, name, email, slug, tier, created_at, is_active, agency_id")
    .order("created_at", { ascending: false })
    .range(offset, offset + (limit as number) - 1);

  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  if (plan) q = q.eq("tier", plan);

  const { data, error } = await q;
  if (error) return json({ error: "DB error." }, 500);
  return json({ agents: data ?? [] });
}

// deno-lint-ignore no-explicit-any
async function getLeads(sb: SB, params: Record<string, any>): Promise<Response> {
  const { agent_id, status, page = 0, limit = 50 } = params;
  const offset = (page as number) * (limit as number);

  let q = sb
    .from("leads")
    .select("id, name, email, phone, agent_id, status, source, created_at, budget_range")
    .order("created_at", { ascending: false })
    .range(offset, offset + (limit as number) - 1);

  if (agent_id) q = q.eq("agent_id", agent_id);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return json({ error: "DB error." }, 500);
  return json({ leads: data ?? [] });
}

async function getRevenue(sb: SB): Promise<Response> {
  const [paidAgents, subEvents] = await Promise.allSettled([
    sb
      .from("agents")
      .select("id, name, email, tier, created_at")
      .neq("tier", "free")
      .order("created_at", { ascending: false }),
    sb
      .from("subscription_events")
      .select("agent_id, event_type, amount_cents, created_at, tier")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // deno-lint-ignore no-explicit-any
  const d = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? (r.value.data ?? []) : [];

  return json({ paid_agents: d(paidAgents), subscription_events: d(subEvents) });
}

async function getFeatureFlags(sb: SB): Promise<Response> {
  const { data, error } = await sb.from("feature_flags").select("*").order("name");
  if (error) return json({ error: "DB error." }, 500);
  return json({ flags: data ?? [] });
}

// deno-lint-ignore no-explicit-any
async function toggleFeatureFlag(
  sb: SB,
  params: Record<string, any>,
  tokenHash: string,
): Promise<Response> {
  const { name, enabled } = params;
  if (!name || typeof enabled !== "boolean") {
    return json({ error: "Missing name or enabled." }, 400);
  }

  const { error } = await sb
    .from("feature_flags")
    .upsert({ name, enabled, updated_at: new Date().toISOString() }, { onConflict: "name" });

  if (error) return json({ error: "DB error." }, 500);
  await logAudit(sb, "toggle_feature_flag", tokenHash, null, { name, enabled });
  return json({ ok: true });
}

// deno-lint-ignore no-explicit-any
async function getAuditLog(sb: SB, params: Record<string, any>): Promise<Response> {
  const { page = 0, limit = 50 } = params;
  const offset = (page as number) * (limit as number);

  const { data, error } = await sb
    .from("admin_audit_log")
    .select("id, action, target_agent_id, details, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + (limit as number) - 1);

  if (error) return json({ error: "DB error." }, 500);
  return json({ entries: data ?? [] });
}

// deno-lint-ignore no-explicit-any
async function suspendAgent(
  sb: SB,
  params: Record<string, any>,
  tokenHash: string,
): Promise<Response> {
  const { agent_id, suspended } = params;
  if (!agent_id || typeof suspended !== "boolean") {
    return json({ error: "Missing agent_id or suspended." }, 400);
  }

  const { error } = await sb
    .from("agents")
    .update({ is_active: !suspended })
    .eq("id", agent_id);

  if (error) return json({ error: "DB error." }, 500);
  const action = suspended ? "suspend_agent" : "unsuspend_agent";
  await logAudit(sb, action, tokenHash, agent_id, { agent_id });
  return json({ ok: true });
}

// deno-lint-ignore no-explicit-any
async function deleteAgent(
  sb: SB,
  params: Record<string, any>,
  tokenHash: string,
): Promise<Response> {
  const { agent_id } = params;
  if (!agent_id) return json({ error: "Missing agent_id." }, 400);

  // Log before deletion so the reference exists when we write the audit row.
  // The ON DELETE SET NULL FK means the audit record survives agent deletion.
  await logAudit(sb, "delete_agent", tokenHash, agent_id, { agent_id });

  const { error } = await sb.from("agents").delete().eq("id", agent_id);
  if (error) return json({ error: "DB error." }, 500);
  return json({ ok: true });
}

async function getPlatformHealth(): Promise<Response> {
  return json({
    functions: [
      "capture-lead-v4",
      "send-magic-link",
      "verify-magic-link",
      "log-event",
      "agency-stats",
      "whatsapp-ingest",
      "admin-action",
    ],
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  const log = createLogger("admin-action", req);
  const _start = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Verify ADMIN_TOKEN is configured
  const adminToken = Deno.env.get("ADMIN_TOKEN");
  if (!adminToken) {
    log({ event: "misconfigured", status: 500 });
    log.flush(Date.now() - _start);
    return json({ error: "Admin not configured." }, 500);
  }

  // Constant-time token check
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeEqual(provided, adminToken)) {
    log({ event: "unauthorized", status: 401 });
    log.flush(Date.now() - _start);
    return json({ error: "Unauthorized." }, 401);
  }

  const tokenHash = await hashToken(provided);

  let body: { action?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const { action, params = {} } = body;
  if (!action || typeof action !== "string") {
    return json({ error: "Missing action." }, 400);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let result: Response;
    switch (action) {
      case "get_overview":         result = await getOverview(sb); break;
      case "get_agents":           result = await getAgents(sb, params); break;
      case "get_leads":            result = await getLeads(sb, params); break;
      case "get_revenue":          result = await getRevenue(sb); break;
      case "get_feature_flags":    result = await getFeatureFlags(sb); break;
      case "toggle_feature_flag":  result = await toggleFeatureFlag(sb, params, tokenHash); break;
      case "get_audit_log":        result = await getAuditLog(sb, params); break;
      case "suspend_agent":        result = await suspendAgent(sb, params, tokenHash); break;
      case "delete_agent":         result = await deleteAgent(sb, params, tokenHash); break;
      case "get_platform_health":  result = await getPlatformHealth(); break;
      default:
        result = json({ error: `Unknown action: ${action}` }, 400);
    }
    log({ event: action, status: 200 });
    log.flush(Date.now() - _start);
    return result;
  } catch (err) {
    log({ event: "error", status: 500, error: String(err) });
    log.flush(Date.now() - _start);
    return json({ error: "Internal error." }, 500);
  }
}

Deno.serve((req) => handler(req));
