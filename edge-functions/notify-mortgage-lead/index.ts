// ===========================================
// NOTIFY MORTGAGE LEAD — SellingDubai
// ===========================================
// 1) Emails the AGENT so they know their buyer is mortgage-ready
// 2) Emails PLATFORM OPS (Boban) so a broker can be assigned
// 3) Creates a lead record in the agent's lead list
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const PLATFORM_OPS_EMAIL = Deno.env.get('PLATFORM_OPS_EMAIL');
if (!PLATFORM_OPS_EMAIL) {
  console.error('[notify-mortgage-lead] PLATFORM_OPS_EMAIL env var is not set — cannot start handler');
}

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function escHtml(s: string): string {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function dubaiTime(): string {
  return new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtAed(n: number): string {
  return 'AED ' + Math.round(n).toLocaleString('en-US');
}

// ---- AGENT EMAIL (existing) ----
function buildAgentEmailHtml(
  agent: { name: string; slug: string },
  app: {
    buyer_name: string; buyer_phone?: string; buyer_email?: string;
    monthly_income?: number; employment_type?: string; residency_status?: string;
    property_title?: string; property_value?: number;
    down_payment_pct?: number; preferred_term_years?: number;
    max_loan_amount?: number; estimated_monthly?: number;
    preferred_rate_type?: string;
  },
): string {
  const time = dubaiTime();
  const n = escHtml(app.buyer_name);

  const rows: string[] = [];
  rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;width:120px;vertical-align:top;">Buyer</td><td style="padding:10px 16px;font-weight:600;font-size:15px;color:#111;">${n}</td></tr>`);
  if (app.buyer_phone) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Phone</td><td style="padding:10px 16px;font-weight:600;font-size:15px;"><a href="tel:${escHtml(app.buyer_phone)}" style="color:#111;text-decoration:none;">${escHtml(app.buyer_phone)}</a></td></tr>`);
  if (app.buyer_email) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Email</td><td style="padding:10px 16px;font-weight:600;font-size:14px;"><a href="mailto:${escHtml(app.buyer_email)}" style="color:#111;text-decoration:none;">${escHtml(app.buyer_email)}</a></td></tr>`);
  if (app.property_title) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Property</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.property_title)}</td></tr>`);
  if (app.property_value) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Value</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.property_value)}</td></tr>`);
  if (app.max_loan_amount) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Loan Amount</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.max_loan_amount)}</td></tr>`);
  if (app.estimated_monthly) rows.push(`<tr><td style="padding:10px 16px;color:#888;font-size:13px;">Est. Monthly</td><td style="padding:10px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.estimated_monthly)}/mo</td></tr>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111;border-radius:12px 12px 0 0;padding:24px 24px 20px;text-align:center;">
    <p style="font-size:11px;font-weight:800;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin:0 0 8px;">SELLING DUBAI</p>
    <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0;">&#127974; Your Buyer Wants a Mortgage</h1>
    <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:8px 0 0;">${time} Dubai</p>
  </div>
  <div style="background:#fff;padding:4px 0;">
    <table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>
  </div>
  <div style="background:#fff;padding:20px 24px 28px;text-align:center;border-radius:0 0 12px 12px;">
    <p style="font-size:13px;color:#555;margin:0 0 16px;">A licensed mortgage broker from SellingDubai will contact your buyer directly. No action needed from you &mdash; we handle the mortgage process.</p>
    <p style="font-size:12px;color:#4d65ff;font-weight:600;margin:0;">&#9889; You'll be notified when they're pre-approved and ready to make an offer</p>
  </div>
  <div style="text-align:center;padding:16px;">
    <p style="font-size:11px;color:#bbb;margin:0;"><a href="https://sellingdubai.ae/a/${agent.slug}" style="color:#999;text-decoration:none;">View your profile</a> &middot; <a href="https://sellingdubai.ae/edit" style="color:#999;text-decoration:none;">Dashboard</a></p>
  </div>
</div></body></html>`;
}

// ---- PLATFORM OPS EMAIL (Boban — assign a broker) ----
function buildOpsEmailHtml(
  agent: { name: string; slug: string; email?: string; phone?: string },
  app: {
    id?: string; buyer_name: string; buyer_phone?: string; buyer_email?: string;
    monthly_income?: number; employment_type?: string; residency_status?: string;
    property_title?: string; property_value?: number;
    down_payment_pct?: number; preferred_term_years?: number;
    max_loan_amount?: number; estimated_monthly?: number;
    preferred_rate_type?: string; assigned_bank?: string;
  },
): string {
  const time = dubaiTime();
  const n = escHtml(app.buyer_name);

  const rows: string[] = [];
  // Buyer details
  rows.push(`<tr><td colspan="2" style="padding:12px 16px 4px;font-size:10px;font-weight:700;color:#4d65ff;letter-spacing:0.1em;text-transform:uppercase;">BUYER</td></tr>`);
  rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;width:130px;">Name</td><td style="padding:6px 16px;font-weight:700;font-size:15px;color:#111;">${n}</td></tr>`);
  if (app.buyer_phone) {
    const waPhone = app.buyer_phone.replace(/[^0-9]/g, '');
    rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Phone</td><td style="padding:6px 16px;font-weight:600;font-size:14px;"><a href="https://wa.me/${waPhone}" style="color:#25d366;text-decoration:none;font-weight:700;">${escHtml(app.buyer_phone)}</a> &nbsp;<a href="tel:${escHtml(app.buyer_phone)}" style="color:#888;text-decoration:none;font-size:12px;">call</a></td></tr>`);
  }
  if (app.buyer_email) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Email</td><td style="padding:6px 16px;font-weight:600;font-size:14px;"><a href="mailto:${escHtml(app.buyer_email)}" style="color:#111;text-decoration:none;">${escHtml(app.buyer_email)}</a></td></tr>`);

  // Mortgage details
  rows.push(`<tr><td colspan="2" style="padding:16px 16px 4px;font-size:10px;font-weight:700;color:#4d65ff;letter-spacing:0.1em;text-transform:uppercase;border-top:1px solid #eee;">MORTGAGE</td></tr>`);
  if (app.property_title) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Property</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.property_title)}</td></tr>`);
  if (app.property_value) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Value</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.property_value)}</td></tr>`);
  if (app.max_loan_amount) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Max Loan</td><td style="padding:6px 16px;font-weight:700;font-size:15px;color:#111;">${fmtAed(app.max_loan_amount)}</td></tr>`);
  if (app.estimated_monthly) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Est. Monthly</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.estimated_monthly)}/mo</td></tr>`);
  if (app.down_payment_pct) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Down Payment</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${app.down_payment_pct}%</td></tr>`);
  if (app.preferred_term_years) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Term</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${app.preferred_term_years} years</td></tr>`);
  if (app.preferred_rate_type) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Rate Pref</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.preferred_rate_type)}</td></tr>`);
  if (app.assigned_bank) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Preferred Bank</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.assigned_bank)}</td></tr>`);

  // Buyer profile
  rows.push(`<tr><td colspan="2" style="padding:16px 16px 4px;font-size:10px;font-weight:700;color:#4d65ff;letter-spacing:0.1em;text-transform:uppercase;border-top:1px solid #eee;">BUYER PROFILE</td></tr>`);
  if (app.monthly_income) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Income</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${fmtAed(app.monthly_income)}/mo</td></tr>`);
  if (app.employment_type) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Employment</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.employment_type.replace('_',' '))}</td></tr>`);
  if (app.residency_status) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Residency</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(app.residency_status.replace('_',' '))}</td></tr>`);

  // Agent info
  rows.push(`<tr><td colspan="2" style="padding:16px 16px 4px;font-size:10px;font-weight:700;color:#4d65ff;letter-spacing:0.1em;text-transform:uppercase;border-top:1px solid #eee;">REFERRING AGENT</td></tr>`);
  rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Agent</td><td style="padding:6px 16px;font-weight:600;font-size:14px;color:#111;">${escHtml(agent.name)}</td></tr>`);
  if (agent.email) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Email</td><td style="padding:6px 16px;font-weight:600;font-size:14px;"><a href="mailto:${escHtml(agent.email)}" style="color:#111;text-decoration:none;">${escHtml(agent.email)}</a></td></tr>`);
  if (agent.phone) rows.push(`<tr><td style="padding:6px 16px;color:#888;font-size:13px;">Phone</td><td style="padding:6px 16px;font-weight:600;font-size:14px;"><a href="tel:${escHtml(agent.phone)}" style="color:#111;text-decoration:none;">${escHtml(agent.phone)}</a></td></tr>`);

  // Commission estimate
  const commissionHtml = app.max_loan_amount
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:0 24px 16px;text-align:center;"><span style="font-size:10px;color:#16a34a;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">PLATFORM COMMISSION (1% BROKER FEE)</span><br><span style="font-size:22px;font-weight:800;color:#15803d;">${fmtAed(app.max_loan_amount * 0.01)}</span></div>`
    : '';

  // WhatsApp CTA to buyer
  const waPhone = (app.buyer_phone || '').replace(/[^0-9]/g, '');
  const waMsg = encodeURIComponent(`Hi ${app.buyer_name.trim()}, this is the SellingDubai mortgage team. You recently completed a mortgage pre-qualification and I'd like to help you get the best rate. When's a good time to chat?`);
  const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;">

  <div style="background:#111;border-radius:12px 12px 0 0;padding:24px 24px 20px;text-align:center;">
    <p style="font-size:11px;font-weight:800;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin:0 0 8px;">SELLING DUBAI &middot; OPS</p>
    <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0;">&#128200; Assign Broker</h1>
    <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:8px 0 0;">${time} Dubai</p>
  </div>

  <div style="background:#fef3c7;padding:14px 20px;text-align:center;">
    <p style="font-size:13px;font-weight:700;color:#92400e;margin:0;">&#9200; Buyer was promised broker contact within 2 hours</p>
  </div>

  <div style="background:#fff;padding:4px 0;">
    <table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>
  </div>

  ${commissionHtml}

  <div style="background:#fff;padding:20px 24px 28px;text-align:center;border-radius:0 0 12px 12px;">
    ${waLink ? `<a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;">WhatsApp ${n}</a><br>` : ''}
    ${app.buyer_phone ? `<a href="tel:${escHtml(app.buyer_phone)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;margin-top:10px;">Call ${n}</a>` : ''}
  </div>

  <div style="text-align:center;padding:16px;">
    <p style="font-size:11px;color:#bbb;margin:0;">&copy; 2026 SellingDubai.ae &middot; Platform Ops</p>
  </div>

</div></body></html>`;
}

Deno.serve(async (req: Request) => {
  const log = createLogger('notify-mortgage-lead', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (!PLATFORM_OPS_EMAIL) {
    console.error('[notify-mortgage-lead] PLATFORM_OPS_EMAIL is not configured');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: cors });
  }

  // Internal-only endpoint — called by submit-mortgage with service role key
  const incomingAuth = req.headers.get('authorization') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceKey || incomingAuth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
  }

  try {
    const body = await req.json();
    const { application_id } = body;

    if (!application_id) {
      log({ event: 'bad_request', status: 400 });
      return new Response(JSON.stringify({ error: 'application_id required' }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the application
    const { data: app, error: appErr } = await supabase
      .from('mortgage_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appErr || !app) {
      console.error('Application not found');
      return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404, headers: cors });
    }

    // Fetch the agent
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('*')
      .eq('id', app.agent_id)
      .single();

    if (agentErr || !agent) {
      console.error('Agent not found');
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: cors });
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
    const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'SellingDubai <leads@sellingdubai.ae>';

    const appData = {
      id: app.id,
      buyer_name: app.buyer_name,
      buyer_phone: app.buyer_phone,
      buyer_email: app.buyer_email,
      monthly_income: app.monthly_income,
      employment_type: app.employment_type,
      residency_status: app.residency_status,
      property_title: app.property_title,
      property_value: app.property_value,
      down_payment_pct: app.down_payment_pct,
      preferred_term_years: app.preferred_term_years,
      max_loan_amount: app.max_loan_amount,
      estimated_monthly: app.estimated_monthly,
      preferred_rate_type: app.preferred_rate_type,
      assigned_bank: app.assigned_bank,
    };

    const agentData = {
      name: agent.name,
      slug: agent.slug,
      email: agent.email,
      phone: agent.phone || agent.whatsapp,
    };

    if (RESEND_KEY) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);

      const emailPromises: Promise<void>[] = [];

      // 1) Email the AGENT — "your buyer wants a mortgage"
      if (agent.email) {
        const agentHtml = buildAgentEmailHtml(agentData, appData);
        emailPromises.push(
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              from: RESEND_FROM,
              to: [agent.email],
              subject: `Your buyer ${app.buyer_name} wants a mortgage — ${app.property_title ? app.property_title.substring(0, 50) : 'Pre-Approval'}`,
              html: agentHtml,
            }),
          }).then(async (res) => {
            if (!res.ok) console.error('Agent email error');
          }).catch(() => console.error('Agent email failed'))
        );
      }

      // 2) Email PLATFORM OPS (Boban) — "assign a broker"
      const opsHtml = buildOpsEmailHtml(agentData, appData);
      emailPromises.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [PLATFORM_OPS_EMAIL],
            subject: `[ASSIGN BROKER] ${app.buyer_name} — ${app.max_loan_amount ? fmtAed(app.max_loan_amount) : 'Pre-Qual'} via ${agent.name}`,
            html: opsHtml,
          }),
        }).then(async (res) => {
          if (!res.ok) console.error('Ops email error');
        }).catch(() => console.error('Ops email failed'))
      );

      await Promise.allSettled(emailPromises);

      // Mark notification sent
      await supabase
        .from('mortgage_applications')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', application_id);
    }

    // Also create a lead record so it shows up in agent's lead list
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('phone', app.buyer_phone || '')
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .limit(1);

    if (!existingLead || existingLead.length === 0) {
      await supabase.from('leads').insert({
        agent_id: agent.id,
        name: app.buyer_name,
        phone: app.buyer_phone || null,
        email: app.buyer_email || null,
        source: 'mortgage',
        message: `Mortgage pre-approval request for ${app.property_title || 'property'} — ${app.property_value ? fmtAed(app.property_value) : 'N/A'}. Max loan: ${app.max_loan_amount ? fmtAed(app.max_loan_amount) : 'N/A'}.`,
        agent_notified_at: new Date().toISOString(),
      });
    }

    log({ event: 'success', agent_id: app?.agent_id, status: 200 });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error('notify-mortgage-lead error');
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - _start);
  }
});
