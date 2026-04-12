// get-flags — Returns all feature flags as { flags: { NAME: boolean } }
// In-memory cache with 60s TTL so the DB isn't hit on every page load.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const flags = await getFlags();
    return new Response(JSON.stringify({ flags }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
