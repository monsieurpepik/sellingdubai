// edge-functions/_shared/tool-executor.ts
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = { from: (table: string) => any };

export type ToolName =
  | "get_leads"
  | "update_lead"
  | "get_listings"
  | "update_listing"
  | "get_stats"
  | "get_brief"
  | "get_cobrokes";

export const TOOL_DEFINITIONS = [
  {
    name: "get_leads",
    description: "Get the agent's recent and today's leads",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_lead",
    description: "Update a lead's status or add a note",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        status: {
          type: "string",
          enum: ["new", "contacted", "qualified", "archived"],
        },
        note: { type: "string" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "get_listings",
    description: "Get the agent's active property listings",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_listing",
    description: "Update a listing's price, status, or description",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        price: { type: "number" },
        status: {
          type: "string",
          enum: ["active", "under_offer", "sold", "draft"],
        },
        description: { type: "string" },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "get_stats",
    description: "Get performance stats for the agent",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_brief",
    description: "Get a morning brief: leads needing follow-up + performance summary",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_cobrokes",
    description: "Get open cobroke requests for the agent.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export async function executeTool(
  toolName: ToolName,
  input: Record<string, unknown>,
  agentId: string,
  supabase: SupabaseClient,
): Promise<string> {
  switch (toolName) {
    case "get_leads": {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, phone, status, created_at, notes")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!leads || leads.length === 0) return "You have no leads yet.";
      const lines = leads.map((l: any) =>
        `${l.name} (${l.phone}) — ${l.status}${l.notes ? ` — ${l.notes}` : ""}`
      );
      return `Your ${leads.length} most recent leads:\n${lines.join("\n")}`;
    }

    case "update_lead": {
      const { lead_id, status, note } = input as {
        lead_id: string;
        status?: string;
        note?: string;
      };
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (note) updates.notes = note;
      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", lead_id)
        .eq("agent_id", agentId);
      if (error) return `Failed to update lead: ${error.message}`;
      return `Lead updated successfully.`;
    }

    case "get_listings": {
      const { data: listings } = await supabase
        .from("properties")
        .select("id, title, price, status, bedrooms, area")
        .eq("agent_id", agentId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!listings || listings.length === 0) return "You have no active listings.";
      const lines = listings.map((p: any) =>
        `${p.title} — AED ${p.price?.toLocaleString()} — ${p.bedrooms}BR in ${p.area}`
      );
      return `Your ${listings.length} active listings:\n${lines.join("\n")}`;
    }

    case "update_listing": {
      const { listing_id, price, status, description } = input as {
        listing_id: string;
        price?: number;
        status?: string;
        description?: string;
      };
      const updates: Record<string, unknown> = {};
      if (price !== undefined) updates.price = price;
      if (status) updates.status = status;
      if (description) updates.description = description;
      const { error } = await supabase
        .from("properties")
        .update(updates)
        .eq("id", listing_id)
        .eq("agent_id", agentId);
      if (error) return `Failed to update listing: ${error.message}`;
      return `Listing updated successfully.`;
    }

    case "get_stats": {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [leadsWeek, leadsTotal, activeListings] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId)
          .gte("created_at", weekAgo),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId)
          .eq("status", "active"),
      ]);
      return `Stats: ${leadsWeek.count ?? 0} leads this week, ${leadsTotal.count ?? 0} total leads, ${activeListings.count ?? 0} active listings.`;
    }

    case "get_brief": {
      const [leadsResult, statsResult] = await Promise.all([
        executeTool("get_leads", {}, agentId, supabase),
        executeTool("get_stats", {}, agentId, supabase),
      ]);
      return `Good morning! Here's your brief.\n\n${statsResult}\n\nRecent leads:\n${leadsResult}`;
    }

    case "get_cobrokes": {
      const { data: cobrokes } = await supabase
        .from("cobroke_requests")
        .select("id, property_id, status, message, created_at, requesting_agent_id")
        .or(`agent_id.eq.${agentId},requesting_agent_id.eq.${agentId}`)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cobrokes || cobrokes.length === 0) return "You have no open cobroke requests.";
      const lines = cobrokes.map((c: any) =>
        `Cobroke #${c.id.slice(0, 8)} — ${c.status}${c.message ? ` — "${c.message}"` : ""}`
      );
      return `Your ${cobrokes.length} open cobroke requests:\n${lines.join("\n")}`;
    }

    default:
      return "Unknown tool.";
  }
}
