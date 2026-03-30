import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * cobroke-request
 * Buying agent requests to bring their client to a listing agent's property.
 * Creates a co_broke_deals record with status='requested'.
 * Notifies listing agent via email.
 *
 * Buyer contact details are stored but only revealed to the listing agent
 * AFTER they accept the request.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://sellingdubai-agents.netlify.app",
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
      from: "SellingDubai <cobroke@sellingdubai.ae>",
      to: [to],
      subject,
      html,
    }),
  }).catch((e) => console.error("Email send failed:", e.message));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth
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

    const buyingAgentId = link.agent_id;
    const body = await req.json();
    const propertyId = body.property_id;
    const buyerName = sanitize(body.buyer_name, 100);
    const buyerPhone = sanitize(body.buyer_phone, 20);
    const buyerEmail = sanitize(body.buyer_email, 100);
    const buyerNotes = sanitize(body.buyer_notes, 500);

    if (!propertyId) {
      return new Response(JSON.stringify({ error: "property_id is required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 30 co-broke requests per hour per agent
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentRequests } = await supabase
      .from("co_broke_deals")
      .select("id", { count: "exact", head: true })
      .eq("buying_agent_id", buyingAgentId)
      .gte("created_at", oneHourAgo);
    if (recentRequests !== null && recentRequests >= 30) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get the property
    const { data: property } = await supabase
      .from("properties")
      .select("id, title, location, price, agent_id, open_for_cobroke, is_active, cobroke_commission_split")
      .eq("id", propertyId)
      .single();

    if (!property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!property.open_for_cobroke || !property.is_active) {
      return new Response(JSON.stringify({ error: "Property is not open for co-brokerage" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (property.agent_id === buyingAgentId) {
      return new Response(JSON.stringify({ error: "Cannot co-broke your own property" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check for existing active request on same property by same buying agent
    const { data: existing } = await supabase
      .from("co_broke_deals")
      .select("id, status")
      .eq("property_id", propertyId)
      .eq("buying_agent_id", buyingAgentId)
      .in("status", ["requested", "accepted", "viewing"])
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "You already have an active request on this property" }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Commission split: property's cobroke_commission_split is what the buying agent gets
    const buyingSplit = property.cobroke_commission_split || 50;
    const listingSplit = 100 - buyingSplit;

    // Get both agents
    const { data: buyingAgent } = await supabase
      .from("agents")
      .select("id, name, slug, email, photo_url, agency_name, dld_verified, dld_total_deals")
      .eq("id", buyingAgentId)
      .single();

    const { data: listingAgent } = await supabase
      .from("agents")
      .select("id, name, slug, email")
      .eq("id", property.agent_id)
      .single();

    if (!buyingAgent || !listingAgent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Create the co-broke deal
    const { data: deal, error: insertErr } = await supabase
      .from("co_broke_deals")
      .insert({
        property_id: propertyId,
        listing_agent_id: property.agent_id,
        buying_agent_id: buyingAgentId,
        listing_agent_split: listingSplit,
        buying_agent_split: buyingSplit,
        platform_fee_percent: 5,
        status: "requested",
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_email: buyerEmail,
        buyer_notes: buyerNotes,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr.message);
      return new Response(JSON.stringify({ error: "Failed to create co-broke request" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Notify listing agent
    if (listingAgent.email) {
      const safeTitle = escHtml(property.title || "Untitled Property");
      const safeBuyingName = escHtml(buyingAgent.name);
      const safeAgency = buyingAgent.agency_name ? ` (${escHtml(buyingAgent.agency_name)})` : "";
      const verifiedBadge = buyingAgent.dld_verified ? ' <span style="color:#4ade80;">\u2713 DLD Verified</span>' : "";
      const dealCount = buyingAgent.dld_total_deals ? `${buyingAgent.dld_total_deals} verified deals` : "New agent";

      await sendEmail(
        listingAgent.email,
        `Co-broke request: ${buyingAgent.name} has a buyer for your ${property.location || ""} listing`,
        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#111;">New Co-Broke Request</h2>
          <p><strong>${safeBuyingName}</strong>${safeAgency}${verifiedBadge} has a buyer interested in your property.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Property</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${safeTitle}</strong></td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Location</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(property.location || "N/A")}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Price</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(property.price || "N/A")}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Buying Agent</td><td style="padding:8px;border-bottom:1px solid #eee;">${safeBuyingName} \u2014 ${dealCount}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Commission Split</td><td style="padding:8px;border-bottom:1px solid #eee;">You ${listingSplit}% / Buyer agent ${buyingSplit}%</td></tr>
          </table>
          <p style="color:#666;">Accept this request in your dashboard to see the buyer's contact details and coordinate the viewing.</p>
          <a href="https://agents.sellingdubai.ae/dashboard" style="display:inline-block;padding:12px 24px;background:#1127d2;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">Review Request</a>
        </div>`
      );
    }

    console.log(`Co-broke request: ${buyingAgent.slug} wants to bring buyer to ${listingAgent.slug}'s property (${property.title})`);

    return new Response(JSON.stringify({
      ok: true,
      deal_id: deal.id,
      listing_agent_name: listingAgent.name,
      split: { listing: listingSplit, buying: buyingSplit },
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cobroke-request error:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
