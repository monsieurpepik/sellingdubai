import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * cobroke-listings
 * Browse properties that are open for co-brokerage.
 * Authenticated agents can see available listings from other agents,
 * filtered by area, property type, and price range.
 *
 * GET /cobroke-listings?area=downtown&type=apartment&min_price=1000000&max_price=3000000
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://sellingdubai-agents.netlify.app",
  "http://localhost:3000",
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth via magic link token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: link } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (!link || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!link.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const agentId = link.agent_id;
    const url = new URL(req.url);
    const area = url.searchParams.get("area")?.toLowerCase();
    const propType = url.searchParams.get("type")?.toLowerCase();
    const minPrice = Number(url.searchParams.get("min_price")) || 0;
    const maxPrice = Number(url.searchParams.get("max_price")) || 999999999999;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Build query: open co-broke properties, excluding the requesting agent's own
    let query = supabase
      .from("properties")
      .select(`
        id, title, price, price_numeric, location, property_type,
        bedrooms, area_sqft, image_url, external_url, description, features,
        cobroke_commission_split, cobroke_notes, created_at,
        agent:agent_id (
          id, name, slug, photo_url, agency_name, dld_verified,
          dld_total_deals, dld_total_volume_aed, areas_covered
        )
      `)
      .eq("open_for_cobroke", true)
      .eq("is_active", true)
      .neq("agent_id", agentId)  // Don't show your own properties
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (area) {
      query = query.ilike("location", `%${area}%`);
    }
    if (propType) {
      query = query.ilike("property_type", `%${propType}%`);
    }
    if (minPrice > 0) {
      query = query.gte("price_numeric", minPrice);
    }
    if (maxPrice < 999999999999) {
      query = query.lte("price_numeric", maxPrice);
    }

    // Filter out expired co-broke listings
    query = query.or("cobroke_expires_at.is.null,cobroke_expires_at.gt." + new Date().toISOString());

    const { data: listings, error: queryErr } = await query;

    if (queryErr) {
      console.error("Query error:", queryErr.message);
      return new Response(JSON.stringify({ error: "Failed to fetch listings" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      listings: listings || [],
      count: listings?.length || 0,
      offset,
      limit,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cobroke-listings error:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
