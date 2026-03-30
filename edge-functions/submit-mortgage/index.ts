import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
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
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();

    // Validate required fields
    const { buyer_name, buyer_phone, buyer_email } = body;
    if (!buyer_name || (!buyer_phone && !buyer_email)) {
      return new Response(JSON.stringify({ error: 'Name and at least phone or email required' }), { status: 400, headers: cors });
    }

    // Validate enums
    const validEmployment = ['salaried', 'self_employed', 'business_owner'];
    const validResidency = ['uae_national', 'uae_resident', 'non_resident'];

    if (body.employment_type && !validEmployment.includes(body.employment_type)) {
      return new Response(JSON.stringify({ error: 'Invalid employment type' }), { status: 400, headers: cors });
    }
    if (body.residency_status && !validResidency.includes(body.residency_status)) {
      return new Response(JSON.stringify({ error: 'Invalid residency status' }), { status: 400, headers: cors });
    }

    // Rate limiting by IP hash
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "unknown";
    const ipHash = await sha256(clientIp + (Deno.env.get("RATE_LIMIT_SALT") || "sd-salt-2026"));

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentApps } = await supabase
      .from("mortgage_applications")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gt("created_at", oneHourAgo);
    if (recentApps !== null && recentApps >= 5) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: cors });
    }

    // Build insert payload — only include known columns
    const row: Record<string, unknown> = {
      buyer_name: buyer_name.trim().slice(0, 200),
      buyer_phone: buyer_phone || null,
      buyer_email: buyer_email || null,
      monthly_income: body.monthly_income ? Number(body.monthly_income) : null,
      employment_type: body.employment_type || null,
      residency_status: body.residency_status || null,
      existing_debt_monthly: body.existing_debt_monthly ? Number(body.existing_debt_monthly) : 0,
      property_value: body.property_value ? Number(body.property_value) : null,
      property_id: body.property_id || null,
      property_title: body.property_title || null,
      down_payment_pct: body.down_payment_pct ? Number(body.down_payment_pct) : null,
      preferred_term_years: body.preferred_term_years ? Number(body.preferred_term_years) : null,
      preferred_rate_type: body.preferred_rate_type || null,
      max_loan_amount: body.max_loan_amount ? Number(body.max_loan_amount) : null,
      estimated_monthly: body.estimated_monthly ? Number(body.estimated_monthly) : null,
      agent_id: body.agent_id || null,
      agent_slug: body.agent_slug || null,
      assigned_bank: body.assigned_bank || null,
      source: body.source || 'profile_page',
      status: 'new',
      ip_hash: ipHash,
    };

    const { data, error } = await supabase
      .from('mortgage_applications')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('Insert error:', error);
      return new Response(JSON.stringify({ error: 'Failed to submit application' }), { status: 500, headers: cors });
    }

    // Fire-and-forget: notify agent
    if (data?.id) {
      try {
        const notifyUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-mortgage-lead';
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
          body: JSON.stringify({ application_id: data.id }),
        }).catch(() => {});
      } catch (_) {}
    }

    return new Response(JSON.stringify({ id: data.id }), {
      status: 201,
      headers: cors,
    });
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: cors });
  }
});
