import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const log = createLogger("contact-timeline", req);
  const _start = Date.now();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, token, contact_phone, note, reminder_id, snooze_days } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Validate magic link token and return agent_id
    async function getAgentId(t: string): Promise<string | null> {
      if (!t || typeof t !== "string") return null;
      const { data: link } = await supabase
        .from("magic_links")
        .select("agent_id, expires_at, used_at")
        .eq("token", t)
        .single();
      if (!link) return null;
      if (new Date(link.expires_at) < new Date()) return null;
      if (!link.used_at) return null;
      return link.agent_id;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agent_id = await getAgentId(token);
    if (!agent_id) {
      return new Response(JSON.stringify({ error: "Invalid or expired session." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: get_contacts ===
    // Returns unique contacts with last interaction date + next pending reminder
    if (action === "get_contacts") {
      // Get all interactions grouped by phone — pick the most recent per contact
      const { data: interactions } = await supabase
        .from("contact_interactions")
        .select("contact_phone, contact_name, interaction_type, created_at")
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false });

      // Get next pending reminder per contact
      const { data: reminders } = await supabase
        .from("contact_reminders")
        .select("contact_phone, reminder_type, scheduled_for")
        .eq("agent_id", agent_id)
        .is("sent_at", null)
        .is("dismissed_at", null)
        .order("scheduled_for", { ascending: true });

      // Deduplicate: one entry per phone, keep most recent interaction
      const contactMap = new Map<string, {
        contact_phone: string;
        contact_name: string | null;
        last_interaction_type: string;
        last_interaction_at: string;
        next_reminder_type: string | null;
        next_reminder_at: string | null;
        is_overdue: boolean;
      }>();

      for (const row of (interactions ?? [])) {
        if (!contactMap.has(row.contact_phone)) {
          contactMap.set(row.contact_phone, {
            contact_phone: row.contact_phone,
            contact_name: row.contact_name,
            last_interaction_type: row.interaction_type,
            last_interaction_at: row.created_at,
            next_reminder_type: null,
            next_reminder_at: null,
            is_overdue: false,
          });
        }
      }

      const now = new Date();
      for (const r of (reminders ?? [])) {
        const c = contactMap.get(r.contact_phone);
        if (c && !c.next_reminder_at) {
          c.next_reminder_at = r.scheduled_for;
          c.next_reminder_type = r.reminder_type;
          c.is_overdue = new Date(r.scheduled_for) < now;
        }
      }

      const contacts = Array.from(contactMap.values()).sort(
        (a, b) => new Date(b.last_interaction_at).getTime() - new Date(a.last_interaction_at).getTime()
      );

      log({ event: "success", status: 200, action, agent_id });
      return new Response(JSON.stringify({ contacts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: get_contact ===
    // Returns full interaction timeline + all reminders for a contact phone
    if (action === "get_contact") {
      if (!contact_phone) {
        return new Response(JSON.stringify({ error: "Missing contact_phone" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [interactionsRes, remindersRes] = await Promise.all([
        supabase
          .from("contact_interactions")
          .select("id, interaction_type, notes, contact_name, created_at")
          .eq("agent_id", agent_id)
          .eq("contact_phone", contact_phone)
          .order("created_at", { ascending: true }),
        supabase
          .from("contact_reminders")
          .select("id, reminder_type, scheduled_for, sent_at, dismissed_at, message_draft, contact_name, created_at")
          .eq("agent_id", agent_id)
          .eq("contact_phone", contact_phone)
          .order("scheduled_for", { ascending: true }),
      ]);

      log({ event: "success", status: 200, action, agent_id });
      return new Response(JSON.stringify({
        interactions: interactionsRes.data ?? [],
        reminders: remindersRes.data ?? [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: get_reminders_due ===
    // Returns reminders due now (scheduled_for <= now, not sent or dismissed)
    if (action === "get_reminders_due") {
      const { data, error } = await supabase
        .from("contact_reminders")
        .select("id, contact_phone, contact_name, reminder_type, scheduled_for, message_draft")
        .eq("agent_id", agent_id)
        .is("sent_at", null)
        .is("dismissed_at", null)
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true });

      if (error) {
        log({ event: "error", status: 500, action, error: error.message });
        return new Response(JSON.stringify({ error: "Failed to fetch reminders" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log({ event: "success", status: 200, action, agent_id });
      return new Response(JSON.stringify({ reminders: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: dismiss_reminder ===
    if (action === "dismiss_reminder") {
      if (!reminder_id) {
        return new Response(JSON.stringify({ error: "Missing reminder_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("contact_reminders")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", reminder_id)
        .eq("agent_id", agent_id); // ownership check

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to dismiss reminder" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log({ event: "success", status: 200, action, agent_id });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: snooze_reminder ===
    // snooze_days: 7 or 30
    if (action === "snooze_reminder") {
      if (!reminder_id) {
        return new Response(JSON.stringify({ error: "Missing reminder_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const days = snooze_days === 30 ? 30 : 7;
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + days);

      const { error } = await supabase
        .from("contact_reminders")
        .update({ scheduled_for: newDate.toISOString() })
        .eq("id", reminder_id)
        .eq("agent_id", agent_id);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to snooze reminder" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log({ event: "success", status: 200, action, agent_id, days });
      return new Response(JSON.stringify({ success: true, snoozed_until: newDate.toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: add_note ===
    if (action === "add_note") {
      if (!contact_phone || !note) {
        return new Response(JSON.stringify({ error: "Missing contact_phone or note" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("contact_interactions")
        .insert({
          agent_id,
          contact_phone,
          interaction_type: "manual_note",
          notes: note,
        })
        .select("id, created_at")
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to save note" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log({ event: "success", status: 200, action, agent_id });
      return new Response(JSON.stringify({ success: true, id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log({ event: "bad_request", status: 400 });
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log({ event: "error", status: 500, error: String(err) });
    return new Response(JSON.stringify({ error: "Request failed. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
});
