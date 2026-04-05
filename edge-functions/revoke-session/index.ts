// ===========================================
// REVOKE SESSION — SellingDubai Agent Auth
// ===========================================
// Invalidates a magic link token immediately (logout).
// After revocation, the token will be rejected by all
// authenticated endpoints regardless of expires_at.
//
// POST { token: "abc123..." }
// Returns { success: true }
// ===========================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

Deno.serve(async (req: Request) => {
  const log = createLogger('revoke-session', req);
  const _start = Date.now();
  const cors = { ...getCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      log({ event: 'bad_request', status: 400 });
      return new Response(JSON.stringify({ error: "Token is required." }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mark as revoked. We don't check if it exists — silent success prevents
    // token enumeration (attacker can't tell if a token was ever valid).
    await supabase
      .from("magic_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", token)
      .is("revoked_at", null);

    log({ event: 'success', status: 200 });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("revoke-session error");
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - _start);
  }
});
