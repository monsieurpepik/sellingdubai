// edge-functions/update-mortgage-docs/index.ts
// Updates docs_* columns on a mortgage_applications row.
// Requires the edit_token issued by submit-mortgage at insert time.
// The anon UPDATE policy on mortgage_applications is locked to USING (false),
// so all writes must flow through this function using the service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

const ALLOWED_DOC_TYPES = ["passport", "visa", "emirates_id", "salary_slip", "bank_statement", "noc", "other"];

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

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('update-mortgage-docs', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    log({ event: 'bad_request', status: 405 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  let body: { id?: string; edit_token?: string; doc_type?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors });
  }

  const { id, edit_token, doc_type, path } = body;

  if (!id || !edit_token || !doc_type || !path) {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "id, edit_token, doc_type and path are required" }), { status: 400, headers: cors });
  }

  // Validate doc_type is a known column to prevent arbitrary column writes
  if (!ALLOWED_DOC_TYPES.includes(doc_type)) {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Invalid doc_type" }), { status: 400, headers: cors });
  }

  // Validate path looks like a storage path (no traversal, no URLs)
  if (!/^[a-zA-Z0-9_\-./]+$/.test(path) || path.includes("..") || path.startsWith("/")) {
    log({ event: 'bad_request', status: 400 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Invalid path" }), { status: 400, headers: cors });
  }

  const sb = _createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify the edit_token matches this application row before writing
  const { data: app, error: lookupErr } = await sb
    .from("mortgage_applications")
    .select("id, edit_token")
    .eq("id", id)
    .single();

  if (lookupErr || !app) {
    log({ event: 'error', status: 404 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Application not found" }), { status: 404, headers: cors });
  }

  // Constant-time comparison to prevent timing attacks on the token
  const tokenA = new TextEncoder().encode(app.edit_token ?? "");
  const tokenB = new TextEncoder().encode(edit_token);
  let mismatch = tokenA.length !== tokenB.length ? 1 : 0;
  const len = Math.min(tokenA.length, tokenB.length);
  for (let i = 0; i < len; i++) mismatch |= tokenA[i] ^ tokenB[i];
  if (mismatch !== 0) {
    log({ event: 'auth_failed', status: 401 });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const { error: updateErr } = await sb
    .from("mortgage_applications")
    .update({ [`docs_${doc_type}`]: path })
    .eq("id", id);

  if (updateErr) {
    console.error("Update error");
    log({ event: 'error', status: 500, error: String(updateErr) });
    log.flush(Date.now() - _start);
    return new Response(JSON.stringify({ error: "Update failed" }), { status: 500, headers: cors });
  }

  log({ event: 'success', status: 200 });
  log.flush(Date.now() - _start);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
}

Deno.serve((req) => handler(req));
