import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

/**
 * cobroke-discover
 * Browse co-brokerage listings that the caller hasn't already requested.
 * Authenticated agents see open properties from other agents, excluding
 * any where they already have an active co-broke deal.
 *
 * POST /cobroke-discover
 * Body: { area?, property_type?, price_min?, price_max?, listing_age_days?, limit?, offset? }
 */

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

/** Transform a raw Supabase storage URL to Netlify Image CDN format. */
function toNetlifyImageUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  return `/.netlify/images?url=${encodeURIComponent(rawUrl)}&w=400&fm=webp&q=80`;
}

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("cobroke-discover", req);
  const _start = Date.now();
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (!link || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!link.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const callerAgentId: string = link.agent_id;

    // ── Parse request body ───────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine — all params are optional
    }

    const area = typeof body.area === "string" ? body.area.trim().toLowerCase() : null;
    const propertyType = typeof body.property_type === "string" ? body.property_type.trim().toLowerCase() : null;
    const priceMin = typeof body.price_min === "number" ? body.price_min : 0;
    const priceMax = typeof body.price_max === "number" ? body.price_max : 0;
    const listingAgeDays = typeof body.listing_age_days === "number" ? body.listing_age_days : 0;
    const limit = Math.min(typeof body.limit === "number" ? Math.max(1, body.limit) : 20, 50);
    const offset = typeof body.offset === "number" ? Math.max(0, body.offset) : 0;

    // ── Fetch property IDs already requested by this caller ──────────────────
    // Exclude properties where the caller has an active or already-submitted deal.
    const { data: existingDeals } = await supabase
      .from("co_broke_deals")
      .select("property_id")
      .eq("buying_agent_id", callerAgentId)
      .in("status", ["requested", "accepted", "viewing"]);

    const excludedPropertyIds: string[] = (existingDeals ?? []).map(
      (d: { property_id: string }) => d.property_id,
    );

    // ── Build main query ─────────────────────────────────────────────────────
    let query = supabase
      .from("properties")
      .select(`
        id,
        title,
        location,
        property_type,
        price_numeric,
        bedrooms,
        image_url,
        created_at,
        agent:agent_id (
          id,
          name,
          agency_name
        )
      `, { count: "exact" })
      .eq("open_for_cobroke", true)
      .eq("is_active", true)
      .neq("agent_id", callerAgentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Exclude properties already requested
    if (excludedPropertyIds.length > 0) {
      // Use not-in via multiple neq chained as OR-filter alternative:
      // Supabase JS doesn't have a native "not in" for UUIDs, so use filter
      query = query.not("id", "in", `(${excludedPropertyIds.map((id) => `"${id}"`).join(",")})`);
    }

    // Optional filters
    if (area) {
      query = query.ilike("location", `%${area}%`);
    }
    if (propertyType) {
      query = query.ilike("property_type", `%${propertyType}%`);
    }
    if (priceMin > 0) {
      query = query.gte("price_numeric", priceMin);
    }
    if (priceMax > 0) {
      query = query.lte("price_numeric", priceMax);
    }
    if (listingAgeDays > 0) {
      const cutoff = new Date(Date.now() - listingAgeDays * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", cutoff);
    }

    const { data: rows, error: queryErr, count: total } = await query;

    if (queryErr) {
      console.error("cobroke-discover query error");
      return new Response(JSON.stringify({ error: "Failed to fetch listings" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Shape the response ───────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    const listings = (rows ?? []).map((row: any) => {
      const agent = Array.isArray(row.agent) ? row.agent[0] : row.agent;
      return {
        id: row.id,
        property_id: row.id,
        title: row.title,
        area: row.location,
        property_type: row.property_type,
        price: row.price_numeric,
        bedrooms: row.bedrooms,
        thumbnail_url: toNetlifyImageUrl(row.image_url),
        requesting_agent_id: agent?.id ?? null,
        requesting_agent_name: agent?.name ?? null,
        requesting_agency_name: agent?.agency_name ?? null,
        created_at: row.created_at,
      };
    });

    log({ event: "success", agent_id: callerAgentId, status: 200, count: listings.length });
    return new Response(
      JSON.stringify({
        listings,
        total: total ?? listings.length,
        limit,
        offset,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    log({ event: "error", status: 500, error: String(err) });
    console.error("cobroke-discover error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
