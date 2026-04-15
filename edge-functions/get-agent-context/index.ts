// ===========================================
// GET AGENT CONTEXT — SellingDubai
// ===========================================
// Internal endpoint. Returns a structured snapshot of an agent's current state
// for consumption by other edge functions (ai-secretary, rami-daily-digest).
//
// POST /functions/v1/get-agent-context
// Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// Body: { "agent_id": "<uuid>" }
//
// Returns:
//   {
//     profile:    { name, slug, agency_name, tier, verification_status, photo_url },
//     listings:   { active_count },
//     leads:      { today, this_week, pending, top_area, top_property_type },
//   }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

// Return the most common non-null value in an array, or null if empty
function topValue(arr: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of arr) {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

Deno.serve(async (req) => {
  const log = createLogger("get-agent-context", req);
  const _start = Date.now();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Internal auth — callers must present the service role key
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || token !== serviceKey) {
    log({ event: "unauthorized", status: 401 });
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let agent_id: string | undefined;
  try {
    const body = await req.json();
    agent_id = body?.agent_id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!agent_id) {
    return new Response(JSON.stringify({ error: "agent_id required" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  const nowIso = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Fetch profile, active listing count, and recent leads in parallel
  const [profileResult, listingCountResult, weekLeadsResult] = await Promise.all([
    supabase
      .from("agents")
      .select("name, slug, agency_name, tier, verification_status, photo_url")
      .eq("id", agent_id)
      .single(),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent_id)
      .eq("is_active", true),
    supabase
      .from("leads")
      .select("preferred_area, property_type, status, created_at")
      .eq("agent_id", agent_id)
      .gte("created_at", weekStart.toISOString()),
  ]);

  if (profileResult.error || !profileResult.data) {
    log({ event: "agent_not_found", agent_id, status: 404 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404 });
  }

  const profile = profileResult.data;
  const activeCount = listingCountResult.count ?? 0;
  const weekLeads = weekLeadsResult.data ?? [];

  const todayLeads = weekLeads.filter((l) => l.created_at >= todayStart.toISOString());
  const pendingLeads = weekLeads.filter((l) => l.status === "new" || l.status == null);

  const context = {
    profile: {
      name: profile.name,
      slug: profile.slug,
      agency_name: profile.agency_name ?? null,
      tier: profile.tier,
      verification_status: profile.verification_status,
      photo_url: profile.photo_url ?? null,
    },
    listings: {
      active_count: activeCount,
    },
    leads: {
      today: todayLeads.length,
      this_week: weekLeads.length,
      pending: pendingLeads.length,
      top_area: topValue(weekLeads.map((l) => l.preferred_area)),
      top_property_type: topValue(weekLeads.map((l) => l.property_type)),
    },
  };

  log({ event: "success", agent_id, status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify(context), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
