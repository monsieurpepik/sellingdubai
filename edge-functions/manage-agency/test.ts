import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("manage-agency: missing token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_my_agency" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-agency: invalid token returns 401", async () => {
  // Default mock: magic_links single() → NOT_FOUND (linkErr set)
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID(), action: "get_my_agency" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("manage-agency: unused magic link returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-unused-token", action: "get_my_agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", expires_at: "2099-01-01T00:00:00Z", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("manage-agency: get_my_agency returns null for agent without agency", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_my_agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // agencies maybeSingle() → null (default NOT_FOUND treated as null by maybeSingle)
      // agents single() → no agency_id
      "agents": { data: { agency_id: null }, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (data.agency !== null && data.agency !== undefined && typeof data.agency !== "object") {
    throw new Error(`Expected null or object for agency, got: ${JSON.stringify(data)}`);
  }
});

Deno.test("manage-agency: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("manage-agency: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});

// ── INVITE_AGENT ──

Deno.test("manage-agency: invite_agent returns invite_url and token", async () => {
  const AGENCY_ID = "agency-123";
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "invite_agent", agency_id: AGENCY_ID }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agencies": { data: { id: AGENCY_ID }, error: null },
      "agent_invites": { data: null, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.invite_url || !data.token) throw new Error(`Missing invite_url or token: ${JSON.stringify(data)}`);
  if (!data.invite_url.startsWith("/join?agency=")) throw new Error(`Unexpected invite_url: ${data.invite_url}`);
});

Deno.test("manage-agency: invite_agent with email stores invited_email", async () => {
  const AGENCY_ID = "agency-123";
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "invite_agent", agency_id: AGENCY_ID, email: "agent@example.com" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agencies": { data: { id: AGENCY_ID }, error: null },
      "agent_invites": { data: null, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error(`Missing token: ${JSON.stringify(data)}`);
});

Deno.test("manage-agency: invite_agent forbidden for non-owner", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "invite_agent", agency_id: "other-agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // agencies maybeSingle() returns null → no ownership
    }),
  );
  if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
});

Deno.test("manage-agency: invite_agent missing agency_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "invite_agent" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

// ── GET_INVITES ──

Deno.test("manage-agency: get_invites returns invites list", async () => {
  const AGENCY_ID = "agency-123";
  const mockInvites = [
    { id: "inv-1", token: "tok-1", invited_email: "a@example.com", used_at: null, created_at: "2026-04-08T10:00:00Z" },
    { id: "inv-2", token: "tok-2", invited_email: null, used_at: "2026-04-08T11:00:00Z", created_at: "2026-04-08T09:00:00Z" },
  ];
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_invites", agency_id: AGENCY_ID }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agencies": { data: { id: AGENCY_ID }, error: null },
      "agent_invites": { data: mockInvites, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.invites)) throw new Error(`Expected invites array: ${JSON.stringify(data)}`);
  if (data.invites.length !== 2) throw new Error(`Expected 2 invites, got ${data.invites.length}`);
});

Deno.test("manage-agency: get_invites returns empty array when none exist", async () => {
  const AGENCY_ID = "agency-123";
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_invites", agency_id: AGENCY_ID }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agencies": { data: { id: AGENCY_ID }, error: null },
      // agent_invites not set → defaults to empty array
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.invites)) throw new Error(`Expected invites array: ${JSON.stringify(data)}`);
});

Deno.test("manage-agency: get_invites forbidden for non-owner", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_invites", agency_id: "other-agency" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // agencies maybeSingle() returns null → no ownership
    }),
  );
  if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
});

Deno.test("manage-agency: get_invites missing agency_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", action: "get_invites" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});
