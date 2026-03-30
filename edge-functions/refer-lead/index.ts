import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { escHtml, getCorsHeaders, sanitize } from "../_shared/utils.ts";

/**
 * refer-lead
 * Agent A refers a lead to Agent B (different area/specialization).
 * Creates a lead_referrals record with status='pending'.
 * Sends notification to Agent B via email.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";


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
    // Auth via magic link token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify token — include used_at to check session is activated
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

    const referrerId = link.agent_id;

    // Parse body
    const body = await req.json();
    const receiverSlug = sanitize(body.receiver_slug, 100);
    const leadName = sanitize(body.lead_name, 100);
    const leadPhone = sanitize(body.lead_phone, 20);
    const leadEmail = sanitize(body.lead_email, 100);
    const leadBudget = sanitize(body.lead_budget_range, 50);
    const leadPropertyType = sanitize(body.lead_property_type, 50);
    const leadArea = sanitize(body.lead_preferred_area, 100);
    const leadNotes = sanitize(body.lead_notes, 500);
    const feePercent = Math.min(Math.max(Number(body.referral_fee_percent) || 25, 5), 50);

    if (!receiverSlug || !leadName) {
      return new Response(JSON.stringify({ error: "receiver_slug and lead_name are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get referrer agent
    const { data: referrer } = await supabase
      .from("agents")
      .select("id, name, slug, email")
      .eq("id", referrerId)
      .single();

    if (!referrer) {
      return new Response(JSON.stringify({ error: "Referrer not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get receiver agent
    const { data: receiver } = await supabase
      .from("agents")
      .select("id, name, slug, email")
      .eq("slug", receiverSlug)
      .single();

    if (!receiver) {
      return new Response(JSON.stringify({ error: "Receiving agent not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (referrer.id === receiver.id) {
      return new Response(JSON.stringify({ error: "Cannot refer a lead to yourself" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 20 referrals per hour per agent
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentReferrals } = await supabase
      .from("lead_referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrer.id)
      .gte("created_at", oneHourAgo);
    if (recentReferrals !== null && recentReferrals >= 20) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate (same referrer → receiver with same lead phone in last 7 days)
    if (leadPhone) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: dupe } = await supabase
        .from("lead_referrals")
        .select("id")
        .eq("referrer_id", referrer.id)
        .eq("receiver_id", receiver.id)
        .eq("lead_phone", leadPhone)
        .gte("created_at", sevenDaysAgo)
        .maybeSingle();

      if (dupe) {
        return new Response(JSON.stringify({ error: "This lead was already referred to this agent recently" }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Create the lead referral
    const { data: referral, error: insertErr } = await supabase
      .from("lead_referrals")
      .insert({
        referrer_id: referrer.id,
        receiver_id: receiver.id,
        lead_name: leadName,
        lead_phone: leadPhone,
        lead_email: leadEmail,
        lead_budget_range: leadBudget,
        lead_property_type: leadPropertyType,
        lead_preferred_area: leadArea,
        lead_notes: leadNotes,
        referral_fee_percent: feePercent,
        platform_fee_percent: 10,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Insert error");
      return new Response(JSON.stringify({ error: "Failed to create referral" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Notify receiver via email
    if (receiver.email) {
      const safeName = escHtml(referrer.name);
      const safeLeadName = escHtml(leadName);
      const safeArea = escHtml(leadArea || "Not specified");
      const safeBudget = escHtml(leadBudget || "Not specified");

      await sendEmail(
        receiver.email,
        `Lead Referral from ${referrer.name}`,
        `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#111;">New Lead Referral</h2>
          <p><strong>${safeName}</strong> has referred a lead to you on SellingDubai.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Lead Name</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${safeLeadName}</strong></td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Area</td><td style="padding:8px;border-bottom:1px solid #eee;">${safeArea}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Budget</td><td style="padding:8px;border-bottom:1px solid #eee;">${safeBudget}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Referral Fee</td><td style="padding:8px;border-bottom:1px solid #eee;">${feePercent}% of your commission</td></tr>
          </table>
          <p style="color:#666;">Log in to your dashboard to accept this referral and view the full lead details.</p>
          <a href="https://agents.sellingdubai.ae/dashboard" style="display:inline-block;padding:12px 24px;background:#1127d2;color:#fff;text-decoration:none;border-radius:8px;margin-top:8px;">View Referral</a>
        </div>`
      );
    }

    console.log(`Lead referral created: ${referrer.slug} → ${receiver.slug} (${leadName})`);

    return new Response(JSON.stringify({
      ok: true,
      referral_id: referral.id,
      receiver_name: receiver.name,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("refer-lead error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
