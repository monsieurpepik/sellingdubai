// edge-functions/rotate-siri-token/index.ts
// Rotates the siri_token for an agent after validating a magic-link session token.
//
// POST { token: "<magic-link-token>" }
// Returns { siri_token: "<new-uuid>" }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ClientFactory = (url: string, key: string) => any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function handler(req: Request, _createClient: ClientFactory): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "token required" }, 400);
  }

  const token = body?.token;
  if (!token || typeof token !== "string") {
    return json({ error: "token required" }, 400);
  }

  const supabase = _createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Validate the magic link
  const { data: link, error: linkErr } = await supabase
    .from("magic_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (linkErr || !link) {
    return json({ error: "Invalid token" }, 401);
  }

  if (link.revoked_at != null) {
    return json({ error: "Token revoked" }, 401);
  }

  if (new Date(link.expires_at) < new Date()) {
    return json({ error: "Token expired" }, 401);
  }

  if (link.used_at != null) {
    return json({ error: "Token already used" }, 401);
  }

  // Generate new siri_token
  const newToken: string = crypto.randomUUID();

  // Update agent's siri_token
  const { data: updated, error: updateErr } = await supabase
    .from("agents")
    .update({ siri_token: newToken })
    .eq("id", link.agent_id)
    .select("siri_token")
    .single();

  if (updateErr || !updated) {
    return json({ error: "Failed to rotate token" }, 500);
  }

  // After agents update succeeds, stamp the magic link as used
  const { error: stampErr } = await supabase
    .from("magic_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  if (stampErr) {
    console.error("Failed to stamp magic link used_at", stampErr);
    // Non-fatal: rotation succeeded; warn but don't fail the request
  }

  return json({ siri_token: updated.siri_token });
}

Deno.serve((req) => handler(req, createClient));
