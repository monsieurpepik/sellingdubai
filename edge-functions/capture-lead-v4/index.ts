// ===========================================
// CAPTURE LEAD v5 — SellingDubai
// ===========================================
// Production-ready with:
//  - Lead validation + dedup (24h window)
//  - Resend email notification (verified domain)
//  - WhatsApp + Call + Email deep links in notification
//  - Webhook CRM integration (fire-and-forget)
//  - Facebook Conversion API server-side Lead event
//  - Dubai timezone timestamps (UTC+4)
//  - Source tracking (link page vs full profile)
//
// POST body:
// { agent_slug, name, phone?, email?, budget_range?,
//   property_type?, preferred_area?, message?, source?,
//   utm_source?, utm_medium?, utm_campaign?, device_type? }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isBlockedSsrfUrl, getCorsHeaders as getSharedCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

const FB_GRAPH_API_VERSION = "v21.0";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || null;
  return {
    ...getSharedCorsHeaders(origin),
    "Content-Type": "application/json",
  };
}

// Escape HTML to prevent XSS in email templates
function escHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// SHA-256 hash for FB CAPI (they require hashed PII)
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Format Dubai time (UTC+4)
function dubaiTime(): string {
  return new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Human-readable source label
function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    profile: "Link Page",
    full_profile: "Full Profile",
    landing: "Landing Page",
    qr: "QR Code",
  };
  return map[src] || src || "Direct";
}

// Build the lead notification email HTML
function buildEmailHtml(
  agent: { name: string; slug: string },
  lead: { name: string; phone?: string; email?: string; budget_range?: string; property_type?: string; preferred_area?: string; message?: string; source?: string },
  waLink: string,
): string {
  const n = escHtml(lead.name.trim());
  const time = dubaiTime();
  const src = sourceLabel(lead.source || "profile");

  // Build detail rows — all user data HTML-escaped
  const rows: string[] = [];
  rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;width:100px;vertical-align:top;">Name</td><td style="padding:10px 16px;font-weight:600;font-size:15px;color:#111;">${n}</td></tr>`);
  if (lead.phone) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Phone</td><td style="padding:10px 16px;font-weight:600;font-size:15px;"><a href="tel:${escHtml(lead.phone)}" style="color:#111;text-decoration:none;">${escHtml(lead.phone)}</a></td></tr>`);
  if (lead.email) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Email</td><td style="padding:10px 16px;font-weight:600;font-size:14px;"><a href="mailto:${escHtml(lead.email)}" style="color:#111;text-decoration:none;">${escHtml(lead.email)}</a></td></tr>`);
  if (lead.budget_range) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Budget</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(lead.budget_range)}</td></tr>`);
  if (lead.property_type) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Property</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(lead.property_type)}</td></tr>`);
  if (lead.preferred_area) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Area</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(lead.preferred_area)}</td></tr>`);
  if (lead.message) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;vertical-align:top;">Message</td><td style="padding:10px 16px;font-size:14px;color:#333;line-height:1.5;">${escHtml(lead.message)}</td></tr>`);

  // Build CTA buttons
  const ctas: string[] = [];
  if (waLink) {
    ctas.push(`<a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;min-width:200px;">WhatsApp ${n}</a>`);
  }
  if (lead.phone) {
    ctas.push(`<a href="tel:${escHtml(lead.phone)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;min-width:160px;margin-top:10px;">Call ${n}</a>`);
  }
  if (lead.email) {
    ctas.push(`<a href="mailto:${escHtml(lead.email)}" style="display:inline-block;background:#fff;color:#111;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #ddd;min-width:160px;margin-top:10px;">Email ${n}</a>`);
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="background:#111;border-radius:12px 12px 0 0;padding:24px 24px 20px;text-align:center;">
    <p style="font-size:11px;font-weight:800;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin:0 0 8px;">SELLING DUBAI</p>
    <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0;">New Lead from Your ${src}</h1>
    <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:8px 0 0;">${time} Dubai</p>
  </div>

  <!-- Lead Details -->
  <div style="background:#fff;padding:4px 0;">
    <table style="width:100%;border-collapse:collapse;">
      ${rows.join("")}
    </table>
  </div>

  <!-- CTAs -->
  <div style="background:#fff;padding:20px 24px 28px;text-align:center;border-radius:0 0 12px 12px;">
    ${ctas.join("<br>")}
  </div>

  <!-- Urgency -->
  <div style="text-align:center;padding:20px 16px 8px;">
    <p style="font-size:12px;color:#4d65ff;font-weight:600;margin:0;">
      &#9889; Agents who respond within 5 minutes are 21x more likely to convert
    </p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:8px 16px 24px;">
    <p style="font-size:11px;color:#bbb;margin:0;">
      <a href="https://agents.sellingdubai.ae/a/${agent.slug}" style="color:#999;text-decoration:none;">View your profile</a>
      &nbsp;&middot;&nbsp;
      <a href="https://agents.sellingdubai.ae/edit" style="color:#999;text-decoration:none;">Edit dashboard</a>
    </p>
    <p style="font-size:11px;color:#ccc;margin:8px 0 0;">&copy; 2026 SellingDubai.ae</p>
  </div>

</div>
</body>
</html>`;
}

// Build truncated masked phone for display (privacy: show last 4 digits only)
function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 4) return "****";
  return `+${digits.slice(0, digits.length - 4).replace(/./g, "*")}${digits.slice(-4)}`;
}

async function sendLeadNotificationWhatsApp(
  agentWhatsapp: string,
  lead: { id: string; name: string; phone?: string; email?: string; budget_range?: string; preferred_area?: string },
): Promise<void> {
  const WA_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!WA_TOKEN || !WA_PHONE_ID) return;

  const to = agentWhatsapp.replace(/[^0-9]/g, "");
  if (!to || to.length < 7) return;

  // Build message body (max 1024 chars for body text)
  const contactLine = lead.phone ? maskPhone(lead.phone) : (lead.email ?? "—");
  const details: string[] = [];
  if (lead.preferred_area) details.push(lead.preferred_area);
  if (lead.budget_range) details.push(`Budget: ${lead.budget_range}`);
  const detailLine = details.join(" | ") || "No details";

  const bodyText = `📩 New Lead: *${lead.name.slice(0, 60)}*\n${detailLine}\n📞 ${contactLine}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
              buttons: [
                { type: "reply", reply: { id: `contacted_${lead.id}`, title: "✓ Contacted" } },
                { type: "reply", reply: { id: `view_${lead.id}`, title: "📋 View" } },
                { type: "reply", reply: { id: `archive_${lead.id}`, title: "✗ Archive" } },
              ],
            },
          },
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (_e) {
    // Notification failure is non-fatal — lead is already saved
  }
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('capture-lead-v4', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json();
    const {
      agent_slug, name, phone, email,
      budget_range, property_type, preferred_area, message,
      source, utm_source, utm_medium, utm_campaign, device_type
    } = body;

    // === HONEYPOT: reject bots that fill hidden field ===
    if (body.website || body.company_url) {
      // Silent success — bots think it worked
      return new Response(JSON.stringify({ success: true, lead_id: "ok" }), { status: 200, headers: cors });
    }

    // === VALIDATE ===
    if (!name || !name.trim()) {
      return new Response(JSON.stringify({ error: "Name is required." }), { status: 400, headers: cors });
    }
    if (!phone && !email) {
      return new Response(JSON.stringify({ error: "Phone or email is required." }), { status: 400, headers: cors });
    }
    // Basic email format validation (if provided)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Invalid email format." }), { status: 400, headers: cors });
    }
    // Basic phone validation — must contain at least 7 digits
    if (phone && phone.replace(/[^0-9]/g, "").length < 7) {
      return new Response(JSON.stringify({ error: "Invalid phone number." }), { status: 400, headers: cors });
    }

    // === IP-BASED RATE LIMIT (10 leads per hour per IP) ===
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "unknown";
    // Hash the IP for privacy (don't store raw IPs)
    const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");
    if (!rateLimitSalt) {
      console.error("RATE_LIMIT_SALT env var not set");
      return new Response(JSON.stringify({ error: "Configuration error" }), { status: 500, headers: cors });
    }
    const ipHash = await sha256(clientIp + rateLimitSalt);

    // === INPUT LENGTH LIMITS (prevent abuse) ===
    const MAX_LENGTHS: Record<string, number> = {
      name: 150, phone: 30, email: 254, budget_range: 100,
      property_type: 100, preferred_area: 200, message: 2000,
      source: 50, utm_source: 200, utm_medium: 200, utm_campaign: 200,
      device_type: 50, agent_slug: 100,
    };
    for (const [field, max] of Object.entries(MAX_LENGTHS)) {
      if (body[field] && typeof body[field] === "string" && body[field].length > max) {
        return new Response(
          JSON.stringify({ error: `${field} exceeds maximum length.` }),
          { status: 400, headers: cors }
        );
      }
    }

    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // === IP-BASED RATE LIMIT (10 leads per hour per IP) ===
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gt("created_at", oneHourAgo);

    if (recentLeads !== null && recentLeads >= 10) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: cors });
    }

    // Find agent
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, slug, email, whatsapp, webhook_url, facebook_pixel_id, facebook_capi_token")
      .eq("slug", agent_slug)
      .eq("verification_status", "verified")
      .single();

    if (agentErr) {
      if (agentErr.code === "PGRST116") {
        // No rows — agent genuinely not found or not verified
        return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
      }
      // Any other error is a Supabase infrastructure failure — return 503 so callers can retry
      console.error("[capture-lead-v4] Supabase error fetching agent");
      return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), { status: 503, headers: cors });
    }
    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
    }

    // === DEDUP CHECK (24h window) ===
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let dupQuery = supabase
      .from("leads")
      .select("id")
      .eq("agent_id", agent.id)
      .gt("created_at", twentyFourHoursAgo);

    if (phone) dupQuery = dupQuery.eq("phone", phone);
    else if (email) dupQuery = dupQuery.eq("email", email);

    const { data: existing } = await dupQuery.limit(1);
    if (existing && existing.length > 0) {
      // Silent success — don't reveal it's a duplicate
      return new Response(JSON.stringify({ success: true, lead_id: existing[0].id }), { status: 200, headers: cors });
    }

    // === INSERT LEAD ===
    const { data: lead, error: insertErr } = await supabase
      .from("leads")
      .insert({
        agent_id: agent.id,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        budget_range: budget_range || null,
        property_type: property_type || null,
        preferred_area: preferred_area?.trim() || null,
        message: message?.trim() || null,
        source: source || "profile",
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        device_type: device_type || null,
        ip_hash: ipHash,
      })
      .select("id, name, phone, email, budget_range, property_type, preferred_area, message, source, utm_source, utm_medium, utm_campaign, device_type, created_at")
      .single();

    if (insertErr) {
      console.error("Insert error");
      return new Response(JSON.stringify({ error: "Failed to save lead." }), { status: 500, headers: cors });
    }

    // === BUILD WHATSAPP DEEP LINK ===
    const waPhone = (phone || "").replace(/[^0-9]/g, "");
    const waMsg = encodeURIComponent(
      `Hi ${name.trim()}, thanks for reaching out about Dubai properties! I'm ${agent.name} from SellingDubai. How can I help?`
    );
    const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : "";

    // === FIRE-AND-FORGET NOTIFICATIONS (5s max each) ===

    // 1. Email notification via Resend
    // Uses RESEND_FROM env var. Fallback: leads@sellingdubai.ae
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const RESEND_FROM = Deno.env.get("RESEND_FROM") || "SellingDubai <leads@sellingdubai.ae>";

    if (RESEND_KEY && agent.email) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);

        const emailHtml = buildEmailHtml(
          { name: agent.name, slug: agent.slug },
          { name, phone, email, budget_range, property_type, preferred_area, message, source },
          waLink,
        );

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [agent.email],
            subject: `New Lead: ${name.trim().substring(0, 100)} — ${sourceLabel(source || "profile")}`,
            html: emailHtml,
          }),
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend API error");
        }
      } catch (e) {
        console.error("Email notification failed");
      }
    } else {
      console.warn("Email skipped — no RESEND_API_KEY or agent has no email. Agent:", agent.slug);
    }

    // 1b. WhatsApp interactive lead notification
    if (agent.whatsapp) {
      sendLeadNotificationWhatsApp(agent.whatsapp, {
        id: lead.id,
        name: lead.name,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        budget_range: lead.budget_range ?? undefined,
        preferred_area: lead.preferred_area ?? undefined,
      }).catch(() => {}); // fire-and-forget
    }

    // 2. Webhook (CRM integration)
    if (agent.webhook_url) {
      // Re-validate URL at fetch time (defense-in-depth against SSRF)
      const isSafe = !isBlockedSsrfUrl(agent.webhook_url);
      if (isSafe) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);

        await fetch(agent.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            event: "lead.created",
            lead: {
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              email: lead.email,
              budget_range: lead.budget_range,
              property_type: lead.property_type,
              preferred_area: lead.preferred_area,
              message: lead.message,
              source: lead.source,
              utm_source: lead.utm_source,
              utm_medium: lead.utm_medium,
              utm_campaign: lead.utm_campaign,
              device_type: lead.device_type,
              created_at: lead.created_at,
            },
            agent: {
              id: agent.id,
              name: agent.name,
              slug: agent.slug,
              email: agent.email,
            },
          }),
        });
      } catch (e) {
        console.error("Webhook failed");
      }
      } // end isSafe
    }

    // 3. Facebook Conversion API — Server-side Lead event
    if (agent.facebook_pixel_id && agent.facebook_capi_token) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);

        // Hash PII fields as required by FB CAPI
        const userData: Record<string, string[]> = {};
        if (email) userData.em = [await sha256(email.trim())];
        if (phone) userData.ph = [await sha256(phone.replace(/[^0-9]/g, ""))];
        if (name) {
          const parts = name.trim().split(" ");
          userData.fn = [await sha256(parts[0] || "")];
          if (parts.length > 1) userData.ln = [await sha256(parts[parts.length - 1] || "")];
        }
        userData.country = [await sha256("ae")]; // UAE

        const eventData = {
          data: [{
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: `https://agents.sellingdubai.ae/a/${agent.slug}`,
            user_data: userData,
            custom_data: {
              lead_id: lead.id,
              budget_range: budget_range || null,
              property_type: property_type || null,
              preferred_area: preferred_area || null,
              currency: "AED",
              content_name: "SellingDubai Lead",
              content_category: "real_estate",
            },
          }],
        };

        const capiUrl = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}/${agent.facebook_pixel_id}/events?access_token=${agent.facebook_capi_token}`;

        const capiRes = await fetch(capiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(eventData),
        });

        if (!capiRes.ok) {
          const errBody = await capiRes.text();
          console.error("FB CAPI error");
        }
      } catch (e) {
        console.error("FB CAPI failed");
      }
    }

    // Update notification timestamp — must be inside try so errors are caught
    await supabase
      .from("leads")
      .update({ agent_notified_at: new Date().toISOString() })
      .eq("id", lead.id);

    // === SMART REMINDERS — fire-and-forget, never blocks response ===
    // Schedule 5 follow-up reminders for this contact
    if (lead.phone) {
      const area = lead.preferred_area?.trim() || "Dubai";
      const contactName = lead.name.trim();
      const contactPhone = lead.phone.trim();
      const now = new Date();

      const addDays = (d: number) => {
        const t = new Date(now);
        t.setDate(t.getDate() + d);
        return t.toISOString();
      };
      const addMonths = (m: number) => {
        const t = new Date(now);
        t.setMonth(t.getMonth() + m);
        return t.toISOString();
      };

      const reminders = [
        {
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          reminder_type: "follow_up",
          scheduled_for: addDays(3),
          message_draft: `Hi ${contactName}, just checking in — have you had a chance to explore the properties I sent? Happy to arrange viewings at your convenience.`,
        },
        {
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          reminder_type: "reconnect",
          scheduled_for: addDays(30),
          message_draft: `Hi ${contactName}, it's been a month since we connected. The ${area} market has seen some new listings — want me to send over the latest options?`,
        },
        {
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          reminder_type: "market_update",
          scheduled_for: addMonths(6),
          message_draft: `Hi ${contactName}, Dubai ${area} prices have moved since we last spoke. Several properties in your range have come to market. Worth a quick catch-up?`,
        },
        {
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          reminder_type: "anniversary",
          scheduled_for: addMonths(12),
          message_draft: `Hi ${contactName}, it's been a year since we connected! Hope everything is going well. If you're still looking or thinking about investing in Dubai, I'd love to help.`,
        },
        {
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          reminder_type: "refinance_check",
          scheduled_for: addMonths(18),
          message_draft: `Hi ${contactName}, with current EIBOR rates it might be worth reviewing your mortgage options. Happy to connect you with our broker for a free review.`,
        },
      ];

      // Fire-and-forget — do not await, never block the response
      supabase
        .from("contact_reminders")
        .insert(reminders)
        .then(({ error }) => {
          if (error) console.error("contact_reminders insert failed");
        });

      // Log the lead_captured interaction
      supabase
        .from("contact_interactions")
        .insert({
          agent_id: agent.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          interaction_type: "lead_captured",
          notes: lead.message || null,
        })
        .then(({ error }) => {
          if (error) console.error("contact_interactions insert failed");
        });
    }

    log({ event: 'lead_captured', agent_id: agent.id, status: 200 });
    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        wa_lead_link: waLink,
      }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("capture-lead error");
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
