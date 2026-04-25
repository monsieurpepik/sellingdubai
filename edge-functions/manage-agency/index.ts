import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ao = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('manage-agency', req);
  const _start = Date.now();
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });

  try {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON." }), { status: 400, headers: cors }); }

  const { token, action } = body;
  if (!token || typeof token !== "string") return new Response(JSON.stringify({ error: "Missing token." }), { status: 401, headers: cors });

  const supabase = _createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Validate magic link token
  const { data: link, error: linkErr } = await supabase
    .from("magic_links")
    .select("agent_id, expires_at, used_at")
    .eq("token", token)
    .single();
  if (linkErr || !link) return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });
  if (new Date(link.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401, headers: cors });
  if (!link.used_at) return new Response(JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }), { status: 401, headers: cors });
  const agentId: string = link.agent_id;

  // ── GET_MY_AGENCY ──
  if (action === "get_my_agency") {
    const { data: agency } = await supabase
      .from("agencies")
      .select("id, slug, name, logo_url, website, description, created_at")
      .eq("owner_agent_id", agentId)
      .maybeSingle();
    if (!agency) {
      const { data: agentRow } = await supabase.from("agents").select("agency_id").eq("id", agentId).single();
      log({ event: 'success', agent_id: agentId, status: 200 });
      return new Response(JSON.stringify({ agency: null, is_owner: false, member_of: agentRow?.agency_id ?? null }), { headers: cors });
    }
    const { data: members } = await supabase
      .from("agents")
      .select("id, name, slug, email, photo_url, tier, verification_status, whatsapp")
      .eq("agency_id", agency.id)
      .order("name")
      .limit(200);
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ agency, members: members ?? [], is_owner: true }), { headers: cors });
  }

  // ── CREATE ──
  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return new Response(JSON.stringify({ error: "Agency name required (min 2 chars)." }), { status: 400, headers: cors });
    // Billing gate — Pro or Premium required
    const { data: agentTierData } = await supabase.from("agents").select("tier").eq("id", agentId).single();
    if (!agentTierData || agentTierData.tier === "free") return new Response(JSON.stringify({ error: "Agency creation requires a Pro or Premium plan. Upgrade at sellingdubai.com to unlock this feature." }), { status: 403, headers: cors });
    const { data: existing } = await supabase.from("agencies").select("id").eq("owner_agent_id", agentId).maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: "You already have an agency." }), { status: 409, headers: cors });
    // Generate unique slug
    let base = slugify(name) || "agency";
    let slug = base;
    let agency = null;
    let insertErr = null;
    // Try up to 10 times to get a unique slug
    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) {
        slug = `${base}-${attempt}`;
      }
      const { data: taken } = await supabase.from("agencies").select("id").eq("slug", slug).maybeSingle();
      if (taken) { slug = `${base}-${attempt + 1}`; continue; }
      const { data: inserted, error: err } = await supabase
        .from("agencies")
        .insert({
          slug,
          name,
          logo_url: typeof body.logo_url === "string" && body.logo_url ? (body.logo_url.startsWith("https://") && !body.logo_url.match(/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/) ? body.logo_url : null) : null,
          website: typeof body.website === "string" && body.website ? (body.website.startsWith("https://") && !body.website.match(/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/) ? body.website : null) : null,
          description: typeof body.description === "string" ? body.description || null : null,
          owner_agent_id: agentId,
        })
        .select("id, slug, name, logo_url, website, description, created_at")
        .single();
      if (err && err.code === "23505") continue; // slug conflict, retry
      agency = inserted;
      insertErr = err;
      break;
    }
    if (insertErr || !agency) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to create agency' });
      return new Response(JSON.stringify({ error: "Failed to create agency." }), { status: 500, headers: cors });
    }
    // Add owner as member
    await supabase.from("agents").update({ agency_id: agency.id }).eq("id", agentId);
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ agency, is_owner: true }), { headers: cors });
  }

  // ── UPDATE ──
  if (action === "update") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    if (!agencyId) return new Response(JSON.stringify({ error: "Missing agency_id." }), { status: 400, headers: cors });
    const { data: agency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!agency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    const updates: Record<string, unknown> = {};
    if ("name" in body) updates.name = typeof body.name === "string" ? body.name.trim() || null : null;
    if ("logo_url" in body) updates.logo_url = typeof body.logo_url === "string" && body.logo_url ? (body.logo_url.startsWith("https://") && !body.logo_url.match(/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/) ? body.logo_url : null) : null;
    if ("website" in body) updates.website = typeof body.website === "string" && body.website ? (body.website.startsWith("https://") && !body.website.match(/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/) ? body.website : null) : null;
    if ("description" in body) updates.description = typeof body.description === "string" ? body.description || null : null;
    if (Object.keys(updates).length === 0) return new Response(JSON.stringify({ error: "No fields to update." }), { status: 400, headers: cors });
    const { data: updated, error: upErr } = await supabase.from("agencies").update(updates).eq("id", agencyId).eq("owner_agent_id", agentId).select("id, slug, name, logo_url, website, description, created_at").single();
    if (upErr) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Update failed' });
      return new Response(JSON.stringify({ error: "Update failed." }), { status: 500, headers: cors });
    }
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ agency: updated }), { headers: cors });
  }

  // ── ADD_MEMBER ──
  if (action === "add_member") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    const memberEmail = typeof body.member_email === "string" ? body.member_email.trim().toLowerCase() : "";
    if (!agencyId || !memberEmail) return new Response(JSON.stringify({ error: "Missing agency_id or member_email." }), { status: 400, headers: cors });
    const { data: ownerAgency } = await supabase.from("agencies").select("id, name").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!ownerAgency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    const { data: ownerAgent } = await supabase.from("agents").select("name").eq("id", agentId).single();
    const { data: target } = await supabase.from("agents").select("id, name, email, agency_id").eq("email", memberEmail).maybeSingle();
    if (!target) return new Response(JSON.stringify({ error: "No agent found with that email." }), { status: 404, headers: cors });
    if (target.id === agentId) return new Response(JSON.stringify({ error: "You are already the agency owner." }), { status: 409, headers: cors });
    if (target.agency_id) return new Response(JSON.stringify({ error: "This agent already belongs to an agency." }), { status: 409, headers: cors });
    const { error: addErr } = await supabase.from("agents").update({ agency_id: agencyId }).eq("id", target.id);
    if (addErr) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to add member' });
      return new Response(JSON.stringify({ error: "Failed to add member." }), { status: 500, headers: cors });
    }
    // Notify new member via email (fire-and-forget)
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const RESEND_FROM = Deno.env.get("RESEND_FROM") || "SellingDubai <leads@sellingdubai.com>";
    if (RESEND_KEY && target.email) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [target.email],
          subject: `You've been added to ${ownerAgency.name} on SellingDubai`,
          html: `<p>Hi ${target.name},</p><p>You've been added to <strong>${ownerAgency.name}</strong> on SellingDubai by ${ownerAgent?.name || "an agency owner"}.</p><p>You can now view agency analytics via your dashboard. If this was unexpected, please contact <a href="mailto:support@sellingdubai.com">support@sellingdubai.com</a>.</p>`,
        }),
      }).catch(() => {});
    }
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ success: true, member: { id: target.id, name: target.name, email: target.email } }), { headers: cors });
  }

  // ── REMOVE_MEMBER ──
  if (action === "remove_member") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    const memberId = typeof body.member_id === "string" ? body.member_id : "";
    if (!agencyId || !memberId) return new Response(JSON.stringify({ error: "Missing agency_id or member_id." }), { status: 400, headers: cors });
    const { data: ownerAgency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!ownerAgency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    if (memberId === agentId) return new Response(JSON.stringify({ error: "Cannot remove the agency owner." }), { status: 409, headers: cors });
    const { data: removed, error: removeErr } = await supabase.from("agents").update({ agency_id: null }).eq("id", memberId).eq("agency_id", agencyId).select("id");
    if (removeErr) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to remove member' });
      return new Response(JSON.stringify({ error: "Failed to remove member." }), { status: 500, headers: cors });
    }
    if (!removed || removed.length === 0) {
      log({ event: 'bad_request', agent_id: agentId, status: 404 });
      return new Response(JSON.stringify({ error: "Member not found in this agency." }), { status: 404, headers: cors });
    }
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  // ── INVITE_AGENT ──
  if (action === "invite_agent") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    if (!agencyId) return new Response(JSON.stringify({ error: "Missing agency_id." }), { status: 400, headers: cors });
    const { data: ownerAgency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!ownerAgency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    const inviteToken = crypto.randomUUID();
    const invitedEmail = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
    const { error: insertErr } = await supabase.from("agent_invites").insert({
      agency_id: agencyId,
      token: inviteToken,
      invited_email: invitedEmail,
    });
    if (insertErr) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to create invite' });
      return new Response(JSON.stringify({ error: "Failed to create invite." }), { status: 500, headers: cors });
    }
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ invite_url: "/join?agency=" + inviteToken, token: inviteToken }), { headers: cors });
  }

  // ── GET_INVITES ──
  if (action === "get_invites") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    if (!agencyId) return new Response(JSON.stringify({ error: "Missing agency_id." }), { status: 400, headers: cors });
    const { data: ownerAgency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!ownerAgency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    const { data: invites, error: fetchErr } = await supabase
      .from("agent_invites")
      .select("id, token, invited_email, used_at, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (fetchErr) {
      log({ event: 'error', agent_id: agentId, status: 500, error: 'Failed to fetch invites' });
      return new Response(JSON.stringify({ error: "Failed to fetch invites." }), { status: 500, headers: cors });
    }
    log({ event: 'success', agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({ invites: invites ?? [] }), { headers: cors });
  }

  log({ event: 'bad_request', agent_id: agentId, status: 400 });
  return new Response(JSON.stringify({ error: "Unknown action." }), { status: 400, headers: cors });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("manage-agency error");
    return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500, headers: corsHeaders(req) });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
