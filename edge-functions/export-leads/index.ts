// ===========================================
// EXPORT LEADS — CSV Download for Agents
// ===========================================
// Authenticated endpoint: agent provides magic link token
// Returns CSV of all their leads
// GET /export-leads (Authorization: Bearer <token>)
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function escCsv(val: string | null | undefined): string {
  if (!val) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

Deno.serve(async (req: Request) => {
  const log = createLogger('export-leads', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization header required." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.slice(7).trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token required." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify token — must be valid and not expired
    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("agent_id, used_at, expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .is("revoked_at", null)
      .single();

    if (linkErr || !link) {
      console.error("export-leads token verification failed");
      return new Response(JSON.stringify({ error: "Invalid or expired token." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (!link.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Fetch all leads for this agent
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("name, phone, email, budget_range, property_type, preferred_area, message, source, utm_source, utm_medium, utm_campaign, device_type, status, created_at")
      .eq("agent_id", link.agent_id)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (leadsErr) {
      console.error("export-leads fetch error");
      return new Response(JSON.stringify({ error: "Failed to fetch leads." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Build CSV
    const headers = ['Name', 'Phone', 'Email', 'Budget', 'Property Type', 'Area', 'Message', 'Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Device', 'Status', 'Date'];
    const rows = (leads || []).map(l => [
      escCsv(l.name),
      escCsv(l.phone),
      escCsv(l.email),
      escCsv(l.budget_range),
      escCsv(l.property_type),
      escCsv(l.preferred_area),
      escCsv(l.message),
      escCsv(l.source),
      escCsv(l.utm_source),
      escCsv(l.utm_medium),
      escCsv(l.utm_campaign),
      escCsv(l.device_type),
      escCsv(l.status),
      escCsv(l.created_at),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    log({ event: 'success', status: 200, agent_id: link.agent_id });
    return new Response(csv, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sellingdubai-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      }
    });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("export-leads error");
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  } finally {
    log.flush(Date.now() - _start);
  }
});
