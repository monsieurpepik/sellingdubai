// edge-functions/waitlist-join/index.ts
// Accepts waitlist signups: inserts into waitlist table, sends Resend confirmation email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ao = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('waitlist-join', req);
  const _start = Date.now();
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    log({ event: 'bad_request', status: 405 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Invalid JSON." }), { status: 400, headers: cors });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim() || null : null;

  if (name.length < 2) {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Name must be at least 2 characters." }), { status: 400, headers: cors });
  }
  if (!EMAIL_RE.test(email)) {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Invalid email address." }), { status: 400, headers: cors });
  }

  const sb = _createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Insert — handle duplicate email gracefully
  const { error: insertErr } = await sb.from("waitlist").insert({ name, email, whatsapp });

  let duplicate = false;
  if (insertErr) {
    if (insertErr.code === "23505") {
      duplicate = true;
    } else {
      log({ event: 'error', status: 500, error: String(insertErr) });
      log.flush(Date.now() - _start);
      return new Response(
        JSON.stringify({ error: "Failed to join waitlist. Please try again." }),
        { status: 500, headers: cors },
      );
    }
  }

  // Get updated count
  const { count } = await sb.from("waitlist").select("id", { count: "exact", head: true });

  // Send confirmation email via Resend (non-blocking, fire-and-forget)
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && !duplicate) {
    const firstName = name.split(" ")[0];
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Selling Dubai <hello@sellingdubai.ae>",
        to: email,
        subject: "You're on the Selling Dubai waitlist",
        html: `<p>Hi ${firstName},</p>
<p>You're on the list. We'll be in touch when we're ready to onboard new agents.</p>
<p>— The Selling Dubai team</p>`,
      }),
    }).catch(() => {});
  }

  log({ event: 'success', status: 200 });
  log.flush(Date.now() - _start);
  return new Response(
    JSON.stringify({ success: true, duplicate, count: count ?? null }),
    { headers: cors },
  );
}

Deno.serve((req) => handler(req));
