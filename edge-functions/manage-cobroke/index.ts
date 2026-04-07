import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { escHtml, getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from '../_shared/logger.ts';

/**
 * manage-cobroke
 * State machine for co-broke deals:
 *   accept    (requested → accepted)     — listing agent only
 *   decline   (requested → declined)     — listing agent only
 *   viewing   (accepted → viewing)       — either agent
 *   close_won (accepted/viewing → closed_won) — either agent, requires deal_value_aed
 *   close_lost (accepted/viewing → closed_lost) — either agent
 *
 * On accept: buyer details are revealed to listing agent.
 * On close_won: commission split is calculated, both agents get bonus listing slot.
 */

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

interface AgentRef { id: string; name: string; slug: string; email: string; }
interface PropertyRef { id: string; title: string; location: string; price: string; }


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
  }).catch(() => console.error("Email send failed"));
}

const VALID_TRANSITIONS: Record<string, { from: string[]; by: "listing" | "buying" | "both" }> = {
  accept:     { from: ["requested"], by: "listing" },
  decline:    { from: ["requested"], by: "listing" },
  viewing:    { from: ["accepted"], by: "both" },
  close_won:  { from: ["accepted", "viewing"], by: "both" },
  close_lost: { from: ["accepted", "viewing"], by: "both" },
};

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('manage-cobroke', req);
  const _start = Date.now();
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
    const supabase = _createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    const dealId = body.deal_id;
    const action = body.action;
    const dealValueAed = Number(body.deal_value_aed) || 0;
    const commissionPercent = Number(body.commission_percent) || 2; // Default 2% Dubai standard

    if (!dealId || !action) {
      return new Response(JSON.stringify({ error: "deal_id and action required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const transition = VALID_TRANSITIONS[action];
    if (!transition) {
      return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get the deal with related data
    const { data: deal } = await supabase
      .from("co_broke_deals")
      .select(`
        *,
        property:property_id (id, title, location, price),
        listing_agent:listing_agent_id (id, name, slug, email),
        buying_agent:buying_agent_id (id, name, slug, email)
      `)
      .eq("id", dealId)
      .single();

    if (!deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Auth check
    const isListing = deal.listing_agent_id === agentId;
    const isBuying = deal.buying_agent_id === agentId;
    if (!isListing && !isBuying) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Role check
    if (transition.by === "listing" && !isListing) {
      return new Response(JSON.stringify({ error: "Only the listing agent can perform this action" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (transition.by === "buying" && !isBuying) {
      return new Response(JSON.stringify({ error: "Only the buying agent can perform this action" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // State check
    if (!transition.from.includes(deal.status)) {
      return new Response(JSON.stringify({
        error: `Cannot ${action} a deal in '${deal.status}' status`,
      }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    // deno-lint-ignore no-explicit-any
    const update: Record<string, any> = { updated_at: now };
    const listingAgent = deal.listing_agent as AgentRef;
    const buyingAgent = deal.buying_agent as AgentRef;
    const property = deal.property as PropertyRef;

    switch (action) {
      case "accept":
        update.status = "accepted";
        update.accepted_at = now;
        // Notify buying agent that request was accepted
        if (buyingAgent?.email) {
          await sendEmail(
            buyingAgent.email,
            `${listingAgent.name} accepted your co-broke request`,
            `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#111;">Co-Broke Accepted!</h2>
              <p><strong>${escHtml(listingAgent.name)}</strong> has accepted your request to bring a buyer to <strong>${escHtml(property?.title || "their property")}</strong>.</p>
              <p>You can now coordinate the viewing. The listing agent has your buyer's details.</p>
              <p><strong>Commission split:</strong> Listing ${deal.listing_agent_split}% / You ${deal.buying_agent_split}%</p>
              <a href="https://agents.sellingdubai.ae/dashboard" style="display:inline-block;padding:12px 24px;background:#1127d2;color:#fff;text-decoration:none;border-radius:8px;margin-top:12px;">View Deal</a>
            </div>`
          );
        }
        break;

      case "decline":
        update.status = "declined";
        update.declined_at = now;
        if (buyingAgent?.email) {
          await sendEmail(
            buyingAgent.email,
            `Co-broke request declined for ${property?.title || "property"}`,
            `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#111;">Request Declined</h2>
              <p><strong>${escHtml(listingAgent.name)}</strong> has declined the co-broke request for <strong>${escHtml(property?.title || "their property")}</strong>.</p>
              <p>You can browse other co-broke listings in your dashboard.</p>
            </div>`
          );
        }
        break;

      case "viewing":
        update.status = "viewing";
        break;

      case "close_won": {
        if (dealValueAed <= 0) {
          return new Response(JSON.stringify({ error: "deal_value_aed required for close_won" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const totalCommission = Math.round(dealValueAed * (commissionPercent / 100));
        const platformFee = Math.round(totalCommission * (deal.platform_fee_percent / 100));
        const afterPlatform = totalCommission - platformFee;
        const listingCommission = Math.round(afterPlatform * (deal.listing_agent_split / 100));
        const buyingCommission = afterPlatform - listingCommission;

        update.status = "closed_won";
        update.closed_at = now;
        update.deal_value_aed = dealValueAed;
        update.total_commission_aed = totalCommission;
        update.listing_agent_commission_aed = listingCommission;
        update.buying_agent_commission_aed = buyingCommission;
        update.platform_fee_aed = platformFee;

        // Bonus listing slots for both agents
        await supabase.rpc("increment_bonus_listings", { agent_uuid: deal.listing_agent_id });
        await supabase.rpc("increment_bonus_listings", { agent_uuid: deal.buying_agent_id });

        // Notify both agents
        const formatAed = (n: number) => n.toLocaleString();

        if (listingAgent?.email) {
          await sendEmail(
            listingAgent.email,
            `Deal closed! AED ${formatAed(listingCommission)} earned on co-broke`,
            `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#111;">Deal Closed \u2014 Congratulations!</h2>
              <p>The co-broke deal on <strong>${escHtml(property?.title || "your property")}</strong> has been closed.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Sale Price</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${formatAed(dealValueAed)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Total Commission (${commissionPercent}%)</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${formatAed(totalCommission)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Your Share (${deal.listing_agent_split}%)</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>AED ${formatAed(listingCommission)}</strong></td></tr>
              </table>
              <p style="color:#4ade80;font-weight:600;">+1 bonus featured listing slot earned!</p>
            </div>`
          );
        }

        if (buyingAgent?.email) {
          await sendEmail(
            buyingAgent.email,
            `Deal closed! AED ${formatAed(buyingCommission)} earned on co-broke`,
            `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
              <h2 style="color:#111;">Deal Closed \u2014 Congratulations!</h2>
              <p>The co-broke deal on <strong>${escHtml(property?.title || "the property")}</strong> with ${escHtml(listingAgent.name)} has been closed.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Sale Price</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${formatAed(dealValueAed)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Total Commission (${commissionPercent}%)</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${formatAed(totalCommission)}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Your Share (${deal.buying_agent_split}%)</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>AED ${formatAed(buyingCommission)}</strong></td></tr>
              </table>
              <p style="color:#4ade80;font-weight:600;">+1 bonus featured listing slot earned!</p>
            </div>`
          );
        }

        console.log(`Co-broke deal closed: AED ${formatAed(dealValueAed)} | Platform fee: AED ${formatAed(platformFee)}`);
        break;
      }

      case "close_lost":
        update.status = "closed_lost";
        update.closed_at = now;
        break;
    }

    const { error: updateErr } = await supabase
      .from("co_broke_deals")
      .update(update)
      .eq("id", dealId);

    if (updateErr) {
      console.error("Update error");
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to update deal' });
      return new Response(JSON.stringify({ error: "Failed to update deal" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({
      ok: true,
      status: update.status,
      ...(update.total_commission_aed ? {
        deal_value_aed: update.deal_value_aed,
        total_commission_aed: update.total_commission_aed,
        listing_agent_commission_aed: update.listing_agent_commission_aed,
        buying_agent_commission_aed: update.buying_agent_commission_aed,
        platform_fee_aed: update.platform_fee_aed,
      } : {}),
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    console.error("manage-cobroke error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
