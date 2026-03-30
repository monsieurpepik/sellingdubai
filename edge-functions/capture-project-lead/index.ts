import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  try {
    const body = await req.json();
    const {
      project_slug,
      agent_slug,
      name,
      phone,
      email,
      budget_range,
      preferred_bedrooms,
      message,
      nationality,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      device_type,
    } = body;

    // Validate required fields
    if (!project_slug) {
      return new Response(JSON.stringify({ error: "Project is required" }), {
        status: 400,
        headers: cors,
      });
    }
    if (!agent_slug) {
      return new Response(JSON.stringify({ error: "Agent is required" }), {
        status: 400,
        headers: cors,
      });
    }
    if (!name || name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: cors,
      });
    }
    if (!phone && !email) {
      return new Response(
        JSON.stringify({ error: "Phone or email is required" }),
        { status: 400, headers: cors }
      );
    }

    // Rate limiting by IP hash
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || "unknown";
    const ipHash = await sha256(clientIp + (Deno.env.get("RATE_LIMIT_SALT") || "sd-salt-2026"));

    // Use service role to bypass RLS for lookups
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentLeads } = await supabase
      .from("project_leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gt("created_at", oneHourAgo);
    if (recentLeads !== null && recentLeads >= 5) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: cors });
    }

    // Look up the project
    const { data: project, error: projErr } = await supabase
      .from("featured_projects")
      .select("id, project_name, developer_name, commission_percent, platform_fee_per_lead")
      .eq("project_slug", project_slug)
      .eq("status", "active")
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found or inactive" }), {
        status: 404,
        headers: cors,
      });
    }

    // Look up the agent
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, whatsapp")
      .eq("slug", agent_slug)
      .eq("is_active", true)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: cors,
      });
    }

    // Insert the project lead
    const { data: lead, error: leadErr } = await supabase
      .from("project_leads")
      .insert({
        project_id: project.id,
        agent_id: agent.id,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        budget_range: budget_range || null,
        preferred_bedrooms: preferred_bedrooms || null,
        message: message || null,
        nationality: nationality || null,
        source: source || "agent_profile",
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        device_type: device_type || null,
        platform_fee_earned: project.platform_fee_per_lead || 0,
        ip_hash: ipHash,
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error");
      return new Response(
        JSON.stringify({ error: "Failed to save inquiry" }),
        { status: 500, headers: cors }
      );
    }

    // Update assignment stats if one exists
    const { data: assignment } = await supabase
      .from("project_agent_assignments")
      .select("id, leads_generated")
      .eq("project_id", project.id)
      .eq("agent_id", agent.id)
      .single();

    if (assignment) {
      await supabase
        .from("project_agent_assignments")
        .update({ leads_generated: (assignment.leads_generated || 0) + 1 })
        .eq("id", assignment.id);
    }

    // Generate WhatsApp deep link — opens agent's WhatsApp pre-filled with buyer context
    let wa_lead_link = null;
    if (agent.whatsapp) {
      const waNum = agent.whatsapp.replace(/[^0-9]/g, "");
      const waMsg = encodeURIComponent(
        `Hi ${name}, thanks for your interest in ${project.project_name} by ${project.developer_name}! I'm ${agent.name} from SellingDubai. How can I help you?`
      );
      wa_lead_link = `https://wa.me/${waNum}?text=${waMsg}`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        project_name: project.project_name,
        developer_name: project.developer_name,
        agent_name: agent.name,
        wa_lead_link,
      }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    console.error("Unexpected error");
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: cors }
    );
  }
});
