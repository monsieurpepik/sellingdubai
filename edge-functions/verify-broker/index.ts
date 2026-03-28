import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEST_BRN = "TEST-0000";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { broker_number } = await req.json();

    // ── Test mode bypass ──────────────────────────────────────────────────────
    // Only active when ENABLE_TEST_MODE=true is set in the Supabase project env.
    // Production never sets this flag, so TEST-0000 is rejected there like any
    // unknown BRN.
    if (
      broker_number === TEST_BRN &&
      Deno.env.get("ENABLE_TEST_MODE") === "true"
    ) {
      return new Response(
        JSON.stringify({
          verified: true,
          license_active: true,
          broker: {
            broker_number: TEST_BRN,
            name_en: "TEST AGENT",
            name_ar: "",
            license_start: "2020-01-01",
            license_end: "2099-12-31",
            brokerage_id: "TEST-AGENCY",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!broker_number || typeof broker_number !== "number") {
      return new Response(
        JSON.stringify({ error: "broker_number (integer) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service_role to bypass RLS on dld_brokers
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up broker
    const { data: broker, error } = await supabase
      .from("dld_brokers")
      .select("broker_number, broker_name_en, broker_name_ar, license_start_date, license_end_date, real_estate_number")
      .eq("broker_number", broker_number)
      .single();

    if (error || !broker) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: "Broker number not found in registry"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if license is active
    const today = new Date().toISOString().split("T")[0];
    const licenseActive = broker.license_end_date >= today;

    return new Response(
      JSON.stringify({
        verified: true,
        license_active: licenseActive,
        broker: {
          broker_number: broker.broker_number,
          name_en: broker.broker_name_en,
          name_ar: broker.broker_name_ar,
          license_start: broker.license_start_date,
          license_end: broker.license_end_date,
          brokerage_id: broker.real_estate_number,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
