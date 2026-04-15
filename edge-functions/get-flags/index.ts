// get-flags — Returns all feature flags as { flags: { NAME: boolean } }
// In-memory cache with 60s TTL so the DB isn't hit on every page load.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];
const IS_LOCAL_DEV = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalOrigin = IS_LOCAL_DEV &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
  const allowedOrigin = isLocalOrigin ? origin
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

interface CacheEntry {
  flags: Record<string, boolean>;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

async function getFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.flags;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await sb
    .from("feature_flags")
    .select("name, enabled");

  if (error || !data) throw new Error("Failed to load feature flags");

  const flags: Record<string, boolean> = {};
  for (const row of data) {
    flags[row.name] = row.enabled;
  }

  cache = { flags, expiresAt: now + 60_000 };
  return flags;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const log = createLogger('get-flags', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });
  }

  try {
    const flags = await getFlags();
    log({ event: 'success', status: 200 });
    return new Response(JSON.stringify({ flags }), { status: 200, headers: cors });
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - _start);
  }
});
