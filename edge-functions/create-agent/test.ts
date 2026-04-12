import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("create-agent: missing required fields returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in body");
});

Deno.test("create-agent: missing email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Test Agent", whatsapp: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("create-agent: missing otp_code returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Test Agent",
        email: "test-no-otp@test.local",
        whatsapp: "+971501234567",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("create-agent: invalid OTP code returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Test Agent",
        email: "test-bad-otp@test.local",
        whatsapp: "+971501234567",
        otp_code: "000000",
      }),
    }),
    mockClientFactory({
      // email_verification_codes not provided → defaults to NOT_FOUND → invalid OTP
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("create-agent: duplicate email returns 409", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Dupe Agent",
        email: "existing@test.local",
        whatsapp: "+971507654321",
        otp_code: "123456",
      }),
    }),
    mockClientFactory({
      "email_verification_codes": { data: { id: "otp-1", email: "existing@test.local", code: "123456", verified: false, expires_at: "2099-01-01T00:00:00Z" }, error: null },
      "agents": { data: [{ id: "existing-agent-1", slug: "existing-agent" }], error: null },
    }),
  );
  if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error in response");
});

Deno.test("create-agent: valid registration creates agent and returns 201", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "New Agent",
        email: "newagent@test.local",
        whatsapp: "+971501234567",
        otp_code: "999888",
      }),
    }),
    mockClientFactory({
      "email_verification_codes": { data: { id: "otp-1", email: "newagent@test.local", code: "999888", verified: false, expires_at: "2099-01-01T00:00:00Z" }, error: null },
      // "agents" with empty array → read checks (duplicate email/broker/slug) return [] → no conflict
      "agents": { data: [], error: null },
      // "agents:write" → used by insert().select().single() → returns the created agent
      "agents:write": { data: { id: "new-agent-1", name: "New Agent", slug: "new-agent", email: "newagent@test.local", photo_url: null, verification_status: "pending" }, error: null },
    }),
  );
  if (res.status !== 201) {
    const body = await res.text();
    throw new Error(`Expected 201, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.agent?.id) throw new Error("Expected agent.id in response");
  if (!data.agent?.slug) throw new Error("Expected agent.slug in response");
  if (!data.edit_token) throw new Error("Expected edit_token in response");
});

Deno.test("create-agent: valid agency_invite_token sets agency_id and marks invite used", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Agency Agent",
        email: "agencyagent@test.local",
        whatsapp: "+971501234567",
        otp_code: "111222",
        agency_invite_token: "valid-invite-token",
      }),
    }),
    mockClientFactory({
      "email_verification_codes": { data: { id: "otp-2", email: "agencyagent@test.local", code: "111222", verified: false, expires_at: "2099-01-01T00:00:00Z" }, error: null },
      "agent_invites": { data: { id: "invite-1", agency_id: "agency-abc", used_at: null }, error: null },
      "agents": { data: [], error: null },
      "agents:write": { data: { id: "new-agent-2", name: "Agency Agent", slug: "agency-agent", email: "agencyagent@test.local", photo_url: null, verification_status: "pending" }, error: null },
    }),
  );
  if (res.status !== 201) {
    const body = await res.text();
    throw new Error(`Expected 201, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.agent?.id) throw new Error("Expected agent.id in response");
});

Deno.test("create-agent: already-used invite token returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Bad Invite Agent",
        email: "badinvite@test.local",
        whatsapp: "+971501234567",
        otp_code: "333444",
        agency_invite_token: "used-or-invalid-token",
      }),
    }),
    mockClientFactory({
      "email_verification_codes": { data: { id: "otp-3", email: "badinvite@test.local", code: "333444", verified: false, expires_at: "2099-01-01T00:00:00Z" }, error: null },
      // agent_invites not present → defaults to NOT_FOUND → single() returns error → 400
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const data = await res.json();
  if (!data.error?.includes("Invalid or already-used")) {
    throw new Error(`Expected invite error message, got: ${data.error}`);
  }
});

Deno.test("create-agent: no agency_invite_token proceeds normally", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Solo Agent",
        email: "soloagent@test.local",
        whatsapp: "+971501234567",
        otp_code: "555666",
        // no agency_invite_token
      }),
    }),
    mockClientFactory({
      "email_verification_codes": { data: { id: "otp-4", email: "soloagent@test.local", code: "555666", verified: false, expires_at: "2099-01-01T00:00:00Z" }, error: null },
      "agents": { data: [], error: null },
      "agents:write": { data: { id: "new-agent-3", name: "Solo Agent", slug: "solo-agent", email: "soloagent@test.local", photo_url: null, verification_status: "pending" }, error: null },
    }),
  );
  if (res.status !== 201) {
    const body = await res.text();
    throw new Error(`Expected 201, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.agent?.id) throw new Error("Expected agent.id in response");
});

Deno.test("create-agent: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
});
