import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

/**
 * post-buyer-request (v2)
 *
 * PREMIUM ONLY — buying agent posts what their buyer wants.
 * System matches against ALL active properties, notifies listing agents.
 *
 * PRIVACY: Buyer details are NEVER shared with listing agents.
 * The connection is agent-to-agent only. Buyer stays with the buying agent.
 *
 * MONETIZATION: No platform cut on deals. Revenue comes from Premium subscriptions
 * that gate access to this matching network.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://staging.sellingdubai.com",
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitize(s: string | undefined | null, maxLen = 200): string {
  if (!s) return "";
  return String(s).trim().slice(0, maxLen);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SellingDubai <matches@sellingdubai.ae>",
      to: [to],
      subject,
      html,
    }),
  }).catch(() => console.error("Email send failed"));
}

function scoreMatch(
  // deno-lint-ignore no-explicit-any
  property: any,
  request: {
    property_type?: string;
    bedrooms_min?: number;
    bedrooms_max?: number;
    budget_min?: number;
    budget_max?: number;
    preferred_areas?: string[];
  }
): number {
  let score = 0;
  let factors = 0;

  // Location (40 pts)
  if (request.preferred_areas && request.preferred_areas.length > 0 && property.location) {
    factors += 40;
    const loc = property.location.toLowerCase();
    if (request.preferred_areas.some((a: string) => loc.includes(a.toLowerCase()))) score += 40;
  }

  // Price (30 pts)
  if ((request.budget_min || request.budget_max) && property.price_numeric) {
    factors += 30;
    const price = Number(property.price_numeric);
    const min = request.budget_min || 0;
    const max = request.budget_max || 999999999999;
    if (price >= min && price <= max) {
      score += 30;
    } else {
      const tolerance = max * 0.2;
      if (price >= min - tolerance && price <= max + tolerance) score += 15;
    }
  }

  // Bedrooms (15 pts)
  if ((request.bedrooms_min || request.bedrooms_max) && property.bedrooms) {
    factors += 15;
    const beds = Number(property.bedrooms);
    if (beds >= (request.bedrooms_min || 0) && beds <= (request.bedrooms_max || 99)) score += 15;
  }

  // Type (15 pts)
  if (request.property_type && property.property_type) {
    factors += 15;
    if (property.property_type.toLowerCase().includes(request.property_type.toLowerCase())) score += 15;
  }

  if (factors === 0) return 50;
  return Math.round((score / factors) * 100);
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('post-buyer-request', req);
  const _start = Date.now();
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const supabase = _createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

    // Get agent — check tier
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, slug, email, agency_name, dld_verified, dld_total_deals, tier, subscription_status")
      .eq("id", link.agent_id)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ═══ PREMIUM GATE ═══
    const isPremium = agent.tier === 'premium' && agent.subscription_status === 'active';
    if (!isPremium) {
      return new Response(JSON.stringify({
        error: "Co-Broke Network is a Premium feature",
        upgrade_required: true,
        message: "Upgrade to Premium to access the agent matching network and find properties for your buyers.",
      }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const propertyType = sanitize(body.property_type, 50) || null;
    const bedroomsMin = body.bedrooms_min ? Math.max(0, Math.min(Number(body.bedrooms_min), 20)) : null;
    const bedroomsMax = body.bedrooms_max ? Math.max(0, Math.min(Number(body.bedrooms_max), 20)) : null;
    const budgetMin = body.budget_min ? Math.max(0, Number(body.budget_min)) : null;
    const budgetMax = body.budget_max ? Math.max(0, Number(body.budget_max)) : null;
    const preferredAreas = Array.isArray(body.preferred_areas)
      ? body.preferred_areas.slice(0, 10).map((a: string) => sanitize(a, 50).toLowerCase()).filter(Boolean)
      : [];
    const additionalNotes = sanitize(body.additional_notes, 500);
    const buyerName = sanitize(body.buyer_name, 100);
    const buyerPhone = sanitize(body.buyer_phone, 20);
    const buyerNationality = sanitize(body.buyer_nationality, 50);
    const buyerTimeline = sanitize(body.buyer_timeline, 20);

    if (!propertyType && preferredAreas.length === 0 && !budgetMin && !budgetMax && !bedroomsMin) {
      return new Response(JSON.stringify({ error: "Provide at least one criterion (area, type, budget, or bedrooms)" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 active requests
    const { count: activeCount } = await supabase
      .from("buyer_requests")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id)
      .eq("status", "active");

    if (activeCount && activeCount >= 5) {
      return new Response(JSON.stringify({ error: "Maximum 5 active buyer requests." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Create buyer request (buyer details stored privately — only this agent sees via RLS)
    const { data: request, error: insertErr } = await supabase
      .from("buyer_requests")
      .insert({
        agent_id: agent.id,
        property_type: propertyType,
        bedrooms_min: bedroomsMin,
        bedrooms_max: bedroomsMax,
        budget_min: budgetMin,
        budget_max: budgetMax,
        preferred_areas: preferredAreas.length > 0 ? preferredAreas : null,
        additional_notes: additionalNotes || null,
        buyer_name: buyerName || null,
        buyer_phone: buyerPhone || null,
        buyer_nationality: buyerNationality || null,
        buyer_timeline: buyerTimeline || null,
        status: "active",
      })
      .select("id")
      .single();

    if (insertErr || !request) {
      console.error("Insert error");
      log({ event: 'error', agent_id: agent.id, status: 500, error: 'Failed to create request' });
      return new Response(JSON.stringify({ error: "Failed to create request" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ═══ MATCHING ENGINE ═══
    const { data: allProperties } = await supabase
      .from("properties")
      .select("id, title, price, price_numeric, location, property_type, bedrooms, area_sqft, image_url, agent_id")
      .eq("is_active", true)
      .neq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const matchCriteria = {
      property_type: propertyType || undefined,
      bedrooms_min: bedroomsMin || undefined,
      bedrooms_max: bedroomsMax || undefined,
      budget_min: budgetMin || undefined,
      budget_max: budgetMax || undefined,
      preferred_areas: preferredAreas.length > 0 ? preferredAreas : undefined,
    };

    // deno-lint-ignore no-explicit-any
    const matches = (allProperties || [] as any[])
      // deno-lint-ignore no-explicit-any
      .map((p: any) => ({ ...p, match_score: scoreMatch(p, matchCriteria) }))
      // deno-lint-ignore no-explicit-any
      .filter((p: any) => p.match_score >= 50)
      // deno-lint-ignore no-explicit-any
      .sort((a: any, b: any) => b.match_score - a.match_score)
      .slice(0, 20);

    // Group by listing agent
    const agentMatches: Record<string, typeof matches> = {};
    for (const m of matches) {
      if (!agentMatches[m.agent_id]) agentMatches[m.agent_id] = [];
      agentMatches[m.agent_id].push(m);
    }

    // Insert match records — NO buyer details included
    // deno-lint-ignore no-explicit-any
    const matchRecords = matches.map((m: any) => ({
      buyer_request_id: request.id,
      property_id: m.id,
      buying_agent_id: agent.id,
      listing_agent_id: m.agent_id,
      match_score: m.match_score,
      status: "notified",
    }));

    if (matchRecords.length > 0) {
      await supabase.from("property_matches").insert(matchRecords);
    }

    await supabase.from("buyer_requests").update({
      matches_found: matches.length,
      last_matched_at: new Date().toISOString(),
      status: matches.length > 0 ? "matched" : "active",
    }).eq("id", request.id);

    // ═══ NOTIFY LISTING AGENTS ═══
    // They see: "An agent has a buyer for your property" + what the buyer wants
    // They do NOT see: buyer name, phone, nationality, or any PII
    const listingAgentIds = Object.keys(agentMatches);
    if (listingAgentIds.length > 0) {
      const { data: listingAgents } = await supabase
        .from("agents")
        .select("id, name, email")
        .in("id", listingAgentIds);

      for (const la of listingAgents || []) {
        if (!la.email) continue;
        const props = agentMatches[la.id];
        if (!props || props.length === 0) continue;

        const safeBuyingName = escHtml(agent.name);
        const safeAgency = agent.agency_name ? ` from ${escHtml(agent.agency_name)}` : "";
        const verifiedTag = agent.dld_verified ? " (DLD Verified)" : "";

        // deno-lint-ignore no-explicit-any
        const propListHtml = props.map((p: any) =>
          `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee;"><strong>${escHtml(p.title || "Untitled")}</strong><br><span style="color:#666;">${escHtml(p.location || "")}</span></td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;"><span style="background:#e0f2e9;color:#065f46;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${p.match_score}%</span></td>
          </tr>`
        ).join("");

        // What the buyer is looking for (criteria only, ZERO PII)
        const criteria: string[] = [];
        if (propertyType) criteria.push(propertyType);
        if (bedroomsMin || bedroomsMax) {
          criteria.push(bedroomsMin === bedroomsMax ? `${bedroomsMin}BR` : `${bedroomsMin || "any"}-${bedroomsMax || "any"}BR`);
        }
        if (preferredAreas.length > 0) criteria.push(preferredAreas.join(", "));
        if (budgetMin || budgetMax) {
          const fmt = (n: number) => `AED ${(n / 1000000).toFixed(1)}M`;
          criteria.push(`${budgetMin ? fmt(budgetMin) : "any"} - ${budgetMax ? fmt(budgetMax) : "any"}`);
        }

        await sendEmail(
          la.email,
          `An agent has a buyer matching ${props.length} of your listing${props.length > 1 ? "s" : ""}`,
          `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#111;">Buyer Match Found</h2>
            <p><strong>${safeBuyingName}</strong>${safeAgency}${verifiedTag} has a buyer looking for:</p>
            <div style="background:#f8f9fa;padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px;">
              <strong>${criteria.join(" \u00b7 ") || "See dashboard for details"}</strong>
            </div>
            <p style="color:#666;">This matches ${props.length} of your listing${props.length > 1 ? "s" : ""}:</p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;">
              <tr><th style="text-align:left;padding:8px;border-bottom:2px solid #eee;color:#666;">Property</th><th style="padding:8px;border-bottom:2px solid #eee;color:#666;text-align:center;">Match</th></tr>
              ${propListHtml}
            </table>
            <p style="color:#666;font-size:13px;">Respond in your dashboard to connect with this agent. No buyer details are shared — you coordinate directly agent-to-agent.</p>
            <a href="https://agents.sellingdubai.ae/dashboard" style="display:inline-block;padding:12px 24px;background:#1127d2;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">View Match</a>
          </div>`
        );
      }
    }

    console.log(`Buyer request ${request.id}: ${matches.length} matches, ${listingAgentIds.length} agents notified`);

    log({ event: 'success', agent_id: agent.id, status: 200 });
    return new Response(JSON.stringify({
      ok: true,
      request_id: request.id,
      matches_found: matches.length,
      agents_notified: listingAgentIds.length,
      // deno-lint-ignore no-explicit-any
      top_matches: matches.slice(0, 5).map((m: any) => ({
        property_id: m.id,
        title: m.title,
        location: m.location,
        price: m.price,
        match_score: m.match_score,
      })),
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    console.error("post-buyer-request error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
