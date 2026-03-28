import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ao = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
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

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON." }), { status: 400, headers: cors }); }

  const { token, action } = body;
  if (!token || typeof token !== "string") return new Response(JSON.stringify({ error: "Missing token." }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Validate magic link token
  const { data: link, error: linkErr } = await supabase
    .from("magic_links")
    .select("agent_id, expires_at")
    .eq("token", token)
    .single();
  if (linkErr || !link) return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });
  if (new Date(link.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401, headers: cors });
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
      return new Response(JSON.stringify({ agency: null, is_owner: false, member_of: agentRow?.agency_id ?? null }), { headers: cors });
    }
    const { data: members } = await supabase
      .from("agents")
      .select("id, name, slug, email, photo_url, tier, verification_status, whatsapp")
      .eq("agency_id", agency.id)
      .order("name");
    return new Response(JSON.stringify({ agency, members: members ?? [], is_owner: true }), { headers: cors });
  }

  // ── CREATE ──
  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return new Response(JSON.stringify({ error: "Agency name required (min 2 chars)." }), { status: 400, headers: cors });
    const { data: existing } = await supabase.from("agencies").select("id").eq("owner_agent_id", agentId).maybeSingle();
    if (existing) return new Response(JSON.stringify({ error: "You already have an agency." }), { status: 409, headers: cors });
    // Generate unique slug
    let base = slugify(name) || "agency";
    let slug = base;
    for (let i = 1; ; i++) {
      const { data: taken } = await supabase.from("agencies").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    const { data: agency, error: insertErr } = await supabase
      .from("agencies")
      .insert({
        slug,
        name,
        logo_url: typeof body.logo_url === "string" ? body.logo_url || null : null,
        website: typeof body.website === "string" ? body.website || null : null,
        description: typeof body.description === "string" ? body.description || null : null,
        owner_agent_id: agentId,
      })
      .select("id, slug, name, logo_url, website, description, created_at")
      .single();
    if (insertErr || !agency) return new Response(JSON.stringify({ error: "Failed to create agency." }), { status: 500, headers: cors });
    // Add owner as member
    await supabase.from("agents").update({ agency_id: agency.id }).eq("id", agentId);
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
    if ("logo_url" in body) updates.logo_url = body.logo_url || null;
    if ("website" in body) updates.website = body.website || null;
    if ("description" in body) updates.description = body.description || null;
    if (Object.keys(updates).length === 0) return new Response(JSON.stringify({ error: "No fields to update." }), { status: 400, headers: cors });
    const { data: updated, error: upErr } = await supabase.from("agencies").update(updates).eq("id", agencyId).select("id, slug, name, logo_url, website, description, created_at").single();
    if (upErr) return new Response(JSON.stringify({ error: "Update failed." }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ agency: updated }), { headers: cors });
  }

  // ── ADD_MEMBER ──
  if (action === "add_member") {
    const agencyId = typeof body.agency_id === "string" ? body.agency_id : "";
    const memberEmail = typeof body.member_email === "string" ? body.member_email.trim().toLowerCase() : "";
    if (!agencyId || !memberEmail) return new Response(JSON.stringify({ error: "Missing agency_id or member_email." }), { status: 400, headers: cors });
    const { data: ownerAgency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("owner_agent_id", agentId).maybeSingle();
    if (!ownerAgency) return new Response(JSON.stringify({ error: "Forbidden." }), { status: 403, headers: cors });
    const { data: target } = await supabase.from("agents").select("id, name, email, agency_id").eq("email", memberEmail).maybeSingle();
    if (!target) return new Response(JSON.stringify({ error: "No agent found with that email." }), { status: 404, headers: cors });
    if (target.id === agentId) return new Response(JSON.stringify({ error: "You are already the agency owner." }), { status: 409, headers: cors });
    if (target.agency_id) return new Response(JSON.stringify({ error: "This agent already belongs to an agency." }), { status: 409, headers: cors });
    const { error: addErr } = await supabase.from("agents").update({ agency_id: agencyId }).eq("id", target.id);
    if (addErr) return new Response(JSON.stringify({ error: "Failed to add member." }), { status: 500, headers: cors });
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
    const { error: removeErr } = await supabase.from("agents").update({ agency_id: null }).eq("id", memberId).eq("agency_id", agencyId);
    if (removeErr) return new Response(JSON.stringify({ error: "Failed to remove member." }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ success: true }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: "Unknown action." }), { status: 400, headers: cors });
});
