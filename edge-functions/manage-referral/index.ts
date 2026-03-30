import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * manage-referral
 * Handles all referral state transitions:
 *   - accept (pending → accepted)
 *   - decline (pending → declined)
 *   - in_progress (accepted → in_progress)
 *   - close_won (accepted/in_progress → closed_won) — calculates commissions
 *   - close_lost (accepted/in_progress → closed_lost)
 *
 * Both referrer and receiver can act, depending on the action.
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

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SellingDubai <referrals@sellingdubai.ae>",
      to: [to],
      subject,
      html,
    }),
  }).catch((e) => console.error("Email send failed:", e.message));
}

// Valid state transitions
const VALID_TRANSITIONS: Record<string, { from: string[]; by: "receiver" | "referrer" | "both" }> = {
  accept:      { from: ["pending"], by: "receiver" },
  decline:     { from: ["pending"], by: "receiver" },
  in_progress: { from: ["accepted"], by: "receiver" },
  close_won:   { from: ["accepted", "in_progress"], by: "receiver" },
  close_lost:  { from: ["accepted", "in_progress"], by: "both" },
};

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
    const referralId = body.referral_id;
    const action = body.action;
    const dealValueAed = Number(body.deal_value_aed) || 0;

    if (!referralId || !action) {
      return new Response(JSON.stringify({ error: "referral_id and action required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const transition = VALID_TRANSITIONS[action];
    if (!transition) {
      return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get the referral
    const { data: referral } = await supabase
      .from("lead_referrals")
      .select("*, referrer:referrer_id(id, name, slug, email), receiver:receiver_id(id, name, slug, email)")
      .eq("id", referralId)
      .single();

    if (!referral) {
      return new Response(JSON.stringify({ error: "Referral not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check authorization: is this agent the referrer or receiver?
    const isReferrer = referral.referrer_id === agentId;
    const isReceiver = referral.receiver_id === agentId;
    if (!isReferrer && !isReceiver) {
      return new Response(JSON.stringify({ error: "Not authorized for this referral" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check role permission
    if (transition.by === "receiver" && !isReceiver) {
      return new Response(JSON.stringify({ error: "Only the receiving agent can perform this action" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (transition.by === "referrer" && !isReferrer) {
      return new Response(JSON.stringify({ error: "Only the referring agent can perform this action" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check state transition validity
    if (!transition.from.includes(referral.status)) {
      return new Response(JSON.stringify({
        error: `Cannot ${action} a referral in '${referral.status}' status`,
      }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build update
    const now = new Date().toISOString();
    const update: Record<string, any> = { updated_at: now };

    switch (action) {
      case "accept":
        update.status = "accepted";
        update.accepted_at = now;
        break;

      case "decline":
        update.status = "declined";
        update.declined_at = now;
        break;

      case "in_progress":
        update.status = "in_progress";
        break;

      case "close_won": {
        if (dealValueAed <= 0) {
          return new Response(JSON.stringify({ error: "deal_value_aed required for close_won" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        // Standard Dubai commission is 2%
        const commission = Math.round(dealValueAed * 0.02);
        const referralFee = Math.round(commission * (referral.referral_fee_percent / 100));
        const platformFee = Math.round(referralFee * (referral.platform_fee_percent / 100));

        update.status = "closed_won";
        update.closed_at = now;
        update.deal_value_aed = dealValueAed;
        update.commission_aed = commission;
        update.referral_fee_aed = referralFee;
        update.platform_fee_aed = platformFee;

        // Award bonus listing slot to referrer for successful deal
        await supabase.rpc("increment_bonus_listings", { agent_uuid: referral.referrer_id });
        break;
      }

      case "close_lost":
        update.status = "closed_lost";
        update.closed_at = now;
        break;
    }

    // Apply update
    const { error: updateErr } = await supabase
      .from("lead_referrals")
      .update(update)
      .eq("id", referralId);

    if (updateErr) {
      console.error("Update error:", updateErr.message);
      return new Response(JSON.stringify({ error: "Failed to update referral" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Send notifications
    const referrerAgent = referral.referrer as any;
    const receiverAgent = referral.receiver as any;

    if (action === "accept" && referrerAgent?.email) {
      await sendEmail(
        referrerAgent.email,
        `${receiverAgent.name} accepted your lead referral`,
        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#111;">Referral Accepted!</h2>
          <p><strong>${escHtml(receiverAgent.name)}</strong> has accepted your referral for <strong>${escHtml(referral.lead_name)}</strong>.</p>
          <p>They'll be working the lead. You'll be notified when the deal closes and your referral fee is calculated.</p>
          <p style="color:#666;">Referral fee: ${referral.referral_fee_percent}% of commission</p>
        </div>`
      );
    }

    if (action === "close_won" && referrerAgent?.email) {
      const feeFormatted = update.referral_fee_aed?.toLocaleString() || "0";
      await sendEmail(
        referrerAgent.email,
        `Deal closed! AED ${feeFormatted} referral fee earned`,
        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#111;">Deal Closed — You Earned AED ${escHtml(feeFormatted)}</h2>
          <p>Your referred lead <strong>${escHtml(referral.lead_name)}</strong> closed a deal worth <strong>AED ${dealValueAed.toLocaleString()}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Deal Value</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${dealValueAed.toLocaleString()}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Commission (2%)</td><td style="padding:8px;border-bottom:1px solid #eee;">AED ${update.commission_aed?.toLocaleString()}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Your Referral Fee (${referral.referral_fee_percent}%)</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>AED ${feeFormatted}</strong></td></tr>
          </table>
          <p style="color:#4ade80;font-weight:600;">You also earned a free featured listing slot!</p>
          <a href="https://agents.sellingdubai.ae/dashboard" style="display:inline-block;padding:12px 24px;background:#1127d2;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">View Dashboard</a>
        </div>`
      );
    }

    if (action === "decline" && referrerAgent?.email) {
      await sendEmail(
        referrerAgent.email,
        `Referral declined by ${receiverAgent.name}`,
        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#111;">Referral Declined</h2>
          <p><strong>${escHtml(receiverAgent.name)}</strong> has declined your referral for <strong>${escHtml(referral.lead_name)}</strong>. You can refer this lead to another agent.</p>
        </div>`
      );
    }

    console.log(`Referral ${referralId}: ${action} by ${isReferrer ? "referrer" : "receiver"}`);

    return new Response(JSON.stringify({
      ok: true,
      status: update.status,
      ...(update.referral_fee_aed ? {
        deal_value_aed: update.deal_value_aed,
        commission_aed: update.commission_aed,
        referral_fee_aed: update.referral_fee_aed,
        platform_fee_aed: update.platform_fee_aed,
      } : {}),
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-referral error:", err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
