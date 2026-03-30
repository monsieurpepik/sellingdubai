import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { escHtml, getCorsHeaders } from "../_shared/utils.ts";

/**
 * respond-to-match
 * Listing agent responds to a property match:
 *   - interested: listing agent wants to connect (creates co_broke_deal, shares contact)
 *   - declined: not interested
 *
 * When listing agent says "interested":
 *   1. Both agents get each other's contact details
 *   2. A co_broke_deal is created in 'accepted' status
 *   3. Both get email with the connection details
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

interface AgentRef { id: string; name: string; slug: string; email: string; phone?: string; whatsapp?: string; agency_name?: string; dld_verified?: boolean; }
interface PropertyRef { id: string; title: string; location: string; price: string; cobroke_commission_split?: number; }
interface BuyerRequest { id: string; buyer_name?: string; buyer_phone?: string; buyer_nationality?: string; buyer_timeline?: string; additional_notes?: string; }


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

    const agentId = link.agent_id;
    const body = await req.json();
    const matchId = body.match_id;
    const action = body.action; // 'interested' or 'declined'

    if (!matchId || !action || !['interested', 'declined'].includes(action)) {
      return new Response(JSON.stringify({ error: "match_id and action ('interested' or 'declined') required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 60 match responses per hour per agent
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentResponses } = await supabase
      .from("property_matches")
      .select("id", { count: "exact", head: true })
      .eq("listing_agent_id", agentId)
      .gte("listing_agent_responded_at", oneHourAgo);
    if (recentResponses !== null && recentResponses >= 60) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get the match with related data
    const { data: match } = await supabase
      .from("property_matches")
      .select(`
        *,
        property:property_id (id, title, location, price, cobroke_commission_split),
        buyer_request:buyer_request_id (
          id, buyer_name, buyer_phone, buyer_nationality, buyer_timeline,
          property_type, bedrooms_min, bedrooms_max, budget_min, budget_max,
          preferred_areas, additional_notes
        ),
        buying_agent:buying_agent_id (id, name, slug, email, phone, whatsapp, agency_name, dld_verified),
        listing_agent:listing_agent_id (id, name, slug, email, phone, whatsapp, agency_name)
      `)
      .eq("id", matchId)
      .single();

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Only listing agent can respond
    if (match.listing_agent_id !== agentId) {
      return new Response(JSON.stringify({ error: "Only the listing agent can respond to this match" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (match.status !== "notified") {
      return new Response(JSON.stringify({ error: `Already responded to this match (status: ${match.status})` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const listingAgent = match.listing_agent as AgentRef;
    const buyingAgent = match.buying_agent as AgentRef;
    const property = match.property as PropertyRef;
    const buyerReq = match.buyer_request as BuyerRequest;

    if (action === "declined") {
      await supabase.from("property_matches").update({
        status: "declined",
        listing_agent_responded_at: now,
      }).eq("id", matchId);

      return new Response(JSON.stringify({ ok: true, status: "declined" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ACTION: interested — connect both agents
    const commissionSplit = property?.cobroke_commission_split || 50;

    // Create co_broke_deal
    const { data: deal, error: dealErr } = await supabase
      .from("co_broke_deals")
      .insert({
        property_id: match.property_id,
        listing_agent_id: match.listing_agent_id,
        buying_agent_id: match.buying_agent_id,
        listing_agent_split: 100 - commissionSplit,
        buying_agent_split: commissionSplit,
        platform_fee_percent: 5,
        status: "accepted",
        buyer_name: buyerReq?.buyer_name || null,
        buyer_phone: buyerReq?.buyer_phone || null,
        buyer_email: null,
        buyer_notes: buyerReq?.additional_notes || null,
        accepted_at: now,
      })
      .select("id")
      .single();

    // Update match status
    await supabase.from("property_matches").update({
      status: "connected",
      listing_agent_responded_at: now,
      connected_at: now,
      deal_id: deal?.id || null,
    }).eq("id", matchId);

    // ─── NOTIFY BOTH AGENTS: You're connected! ───

    // Email to buying agent: listing agent is interested, here's their contact
    if (buyingAgent?.email) {
      const listingWhatsapp = listingAgent.whatsapp
        ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">WhatsApp</td><td style="padding:8px;border-bottom:1px solid #eee;"><a href="https://wa.me/${listingAgent.whatsapp.replace(/[^0-9]/g, '')}">${escHtml(listingAgent.whatsapp)}</a></td></tr>`
        : '';

      await sendEmail(
        buyingAgent.email,
        `Match! ${listingAgent.name} wants to connect about their ${property?.location || ''} listing`,
        `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#111;">You're Connected!</h2>
          <p><strong>${escHtml(listingAgent.name)}</strong>${listingAgent.agency_name ? ` from ${escHtml(listingAgent.agency_name)}` : ''} is interested in connecting about your buyer request.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
            <h3 style="margin:0 0 8px;color:#111;font-size:15px;">Property: ${escHtml(property?.title || 'See details')}</h3>
            <p style="margin:0;color:#666;">${escHtml(property?.location || '')} · ${escHtml(property?.price || '')}</p>
          </div>
          <h3 style="font-size:14px;color:#111;margin:16px 0 8px;">Listing Agent Contact:</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${escHtml(listingAgent.name)}</strong></td></tr>
            ${listingAgent.phone ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(listingAgent.phone)}</td></tr>` : ''}
            ${listingWhatsapp}
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(listingAgent.email)}</td></tr>
          </table>
          <p style="color:#666;font-size:13px;margin-top:16px;">Coordinate the viewing directly. When the deal closes, log it in your dashboard to track the commission split.</p>
        </div>`
      );
    }

    // Email to listing agent: here's the buying agent contact + buyer details
    if (listingAgent?.email) {
      const buyingWhatsapp = buyingAgent.whatsapp
        ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">WhatsApp</td><td style="padding:8px;border-bottom:1px solid #eee;"><a href="https://wa.me/${buyingAgent.whatsapp.replace(/[^0-9]/g, '')}">${escHtml(buyingAgent.whatsapp)}</a></td></tr>`
        : '';

      await sendEmail(
        listingAgent.email,
        `Connected: ${buyingAgent.name} has a buyer for your ${property?.location || ''} listing`,
        `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#111;">Connection Made!</h2>
          <p>Here are the details for the buying agent and their client.</p>
          <h3 style="font-size:14px;color:#111;margin:16px 0 8px;">Buying Agent:</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${escHtml(buyingAgent.name)}</strong>${buyingAgent.dld_verified ? ' <span style="color:#4ade80;">\u2713 Verified</span>' : ''}</td></tr>
            ${buyingAgent.agency_name ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Agency</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyingAgent.agency_name)}</td></tr>` : ''}
            ${buyingAgent.phone ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyingAgent.phone)}</td></tr>` : ''}
            ${buyingWhatsapp}
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyingAgent.email)}</td></tr>
          </table>
          ${buyerReq?.buyer_name ? `
          <h3 style="font-size:14px;color:#111;margin:16px 0 8px;">Buyer Details:</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Buyer Name</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyerReq.buyer_name)}</td></tr>
            ${buyerReq.buyer_phone ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Buyer Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyerReq.buyer_phone)}</td></tr>` : ''}
            ${buyerReq.buyer_nationality ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Nationality</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyerReq.buyer_nationality)}</td></tr>` : ''}
            ${buyerReq.buyer_timeline ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Timeline</td><td style="padding:8px;border-bottom:1px solid #eee;">${escHtml(buyerReq.buyer_timeline)}</td></tr>` : ''}
          </table>` : ''}
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin:16px 0;">
            <strong>Commission split:</strong> You ${100 - commissionSplit}% / Buying agent ${commissionSplit}%
          </div>
          <p style="color:#666;font-size:13px;">Coordinate the viewing directly. Log the deal close in your dashboard to track commissions.</p>
        </div>`
      );
    }

    console.log(`Match connected: ${listingAgent?.slug} <-> ${buyingAgent?.slug} on property ${property?.title}`);

    return new Response(JSON.stringify({
      ok: true,
      status: "connected",
      deal_id: deal?.id,
      buying_agent: {
        name: buyingAgent?.name,
        phone: buyingAgent?.phone,
        whatsapp: buyingAgent?.whatsapp,
        email: buyingAgent?.email,
        agency: buyingAgent?.agency_name,
      },
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("respond-to-match error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
