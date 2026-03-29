import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!agent_slug) {
      return new Response(JSON.stringify({ error: "Agent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!name || name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!phone && !email) {
      return new Response(
        JSON.stringify({ error: "Phone or email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role to bypass RLS for lookups
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      })
      .select("id")
      .single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return new Response(
        JSON.stringify({ error: "Failed to save inquiry" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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

    // Generate WhatsApp deep link for agent follow-up
    let wa_lead_link = null;
    if (agent.whatsapp) {
      const waNum = agent.whatsapp.replace(/[^0-9]/g, "");
      const waMsg = encodeURIComponent(
        `Hi ${name}, thanks for your interest in ${project.project_name} by ${project.developer_name}! I'm ${agent.name} from SellingDubai. How can I help you?`
      );
      wa_lead_link = `https://wa.me/${phone?.replace(/[^0-9]/g, "")}?text=${waMsg}`;
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
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
