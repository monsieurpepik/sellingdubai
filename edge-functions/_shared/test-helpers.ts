import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function fnUrl(name: string): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
  return `${base}/functions/v1/${name}`;
}

export async function seedAgent(
  overrides?: Partial<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const slug = `test-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("agents")
    .insert({
      slug,
      name: "Test Agent",
      email: `${slug}@test.local`,
      phone: "+971501234567",
      verification_status: "verified",
      tier: "free",
      dld_broker_number: "TEST123",
      broker_number: "TEST123",
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`seedAgent: ${error.message}`);
  return data;
}

export async function cleanupAgent(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("magic_links").delete().eq("agent_id", id);
  await supabase.from("leads").delete().eq("agent_id", id);
  await supabase.from("agents").delete().eq("id", id);
}

export async function seedMagicLink(
  agentId: string,
  overrides?: Partial<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from("magic_links")
    .insert({
      agent_id: agentId,
      token,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      used_at: null,
      revoked_at: null,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`seedMagicLink: ${error.message}`);
  return data;
}

export async function seedOtp(
  email: string,
  code = "123456",
  overrides?: Partial<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("email_verification_codes")
    .insert({
      email: email.toLowerCase().trim(),
      code,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      verified: false,
      ip_address: "127.0.0.1",
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`seedOtp: ${error.message}`);
  return data;
}

export async function cleanupOtp(email: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("email_verification_codes")
    .delete()
    .eq("email", email.toLowerCase().trim());
}

export async function seedUsedMagicLink(
  agentId: string,
  overrides?: Partial<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from("magic_links")
    .insert({
      agent_id: agentId,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      used_at: new Date().toISOString(),
      revoked_at: null,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw new Error(`seedUsedMagicLink: ${error.message}`);
  return data;
}

export async function signStripePayload(
  body: string,
  secret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${computed}`;
}
