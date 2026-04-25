// edge-functions/manage-testimonials/index.ts
// CRUD for agent testimonials. Auth: magic_link session token.
// POST { token, action: 'list' } → [{ id, client_name, client_role, content, rating, created_at }]
// POST { token, action: 'add', client_name, client_role?, content, rating? } → { id }
// POST { token, action: 'delete', id } → { success: true }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(data: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type SB = any;

async function resolveAgentId(token: string, supabase: SB): Promise<string | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("magic_links")
    .select("agent_id, used_at, expires_at, revoked_at")
    .eq("token", token)
    .gt("expires_at", now)
    .is("revoked_at", null)
    .single();
  if (!data?.used_at) return null;
  return data.agent_id as string;
}

Deno.serve(async (req: Request) => {
  const log = createLogger("manage-testimonials", req);
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { token, action } = body;

    if (!token) return json({ error: "Authentication required." }, 401, cors);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const agentId = await resolveAgentId(token, supabase);
    if (!agentId) { log({ event: "auth_failed" }); return json({ error: "Invalid or expired session." }, 401, cors); }

    if (action === "list") {
      const { data, error } = await supabase
        .from("testimonials")
        .select("id, client_name, client_role, content, rating, created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return json({ error: "Failed to fetch testimonials." }, 500, cors);
      return json({ testimonials: data ?? [] }, 200, cors);
    }

    if (action === "add") {
      const { client_name, client_role, content, rating } = body;
      if (!client_name?.trim() || client_name.trim().length < 2) return json({ error: "Client name is required." }, 400, cors);
      if (!content?.trim() || content.trim().length < 10) return json({ error: "Testimonial must be at least 10 characters." }, 400, cors);
      if (content.trim().length > 500) return json({ error: "Testimonial must be under 500 characters." }, 400, cors);

      // Limit: 10 testimonials per agent
      const { count } = await supabase
        .from("testimonials")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId);
      if ((count ?? 0) >= 10) return json({ error: "Maximum 10 testimonials reached." }, 400, cors);

      const { data, error } = await supabase
        .from("testimonials")
        .insert({
          agent_id: agentId,
          client_name: client_name.trim().slice(0, 100),
          client_role: client_role?.trim().slice(0, 100) || null,
          content: content.trim().slice(0, 500),
          rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        })
        .select("id")
        .single();
      if (error) return json({ error: "Failed to add testimonial." }, 500, cors);
      log({ event: "testimonial_added", agent_id: agentId });
      return json({ id: data.id }, 201, cors);
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id is required." }, 400, cors);
      const { error } = await supabase
        .from("testimonials")
        .delete()
        .eq("id", id)
        .eq("agent_id", agentId);
      if (error) return json({ error: "Failed to delete testimonial." }, 500, cors);
      return json({ success: true }, 200, cors);
    }

    return json({ error: "Unknown action." }, 400, cors);
  } catch (e) {
    return json({ error: "Internal error." }, 500, cors);
  }
});
