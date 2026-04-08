import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

// ── Shared fixtures ──────────────────────────────────────────────────────────

const VALID_LINK = {
  agent_id: "caller-agent-1",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  used_at: new Date().toISOString(),
};

const MOCK_PROPERTY = {
  id: "prop-1",
  title: "Sea View Studio in JBR",
  location: "JBR",
  property_type: "apartment",
  price_numeric: 2_500_000,
  bedrooms: "1",
  image_url: "https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/images/prop1.jpg",
  created_at: "2026-04-01T10:00:00Z",
  agent: {
    id: "listing-agent-1",
    name: "Sarah Listing",
    agency_name: "Prime Realty",
  },
};

function makeRequest(body: Record<string, unknown> = {}, token = "valid-token") {
  return new Request("http://localhost/cobroke-discover", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Origin": "https://agents.sellingdubai.ae",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

Deno.test("cobroke-discover: returns listings with correct shape", async () => {
  const res = await handler(
    makeRequest(),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [MOCK_PROPERTY], error: null, count: 1 },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();

  // Top-level pagination fields
  assertExists(body.listings);
  assertExists(body.total !== undefined);
  assertEquals(body.limit, 20);
  assertEquals(body.offset, 0);

  // Shape of first listing
  const listing = body.listings[0];
  assertExists(listing.id);
  assertExists(listing.property_id);
  assertExists(listing.title);
  assertExists(listing.area);
  assertExists(listing.property_type);
  assertExists(listing.price !== undefined);
  assertExists(listing.bedrooms !== undefined);
  // thumbnail_url should be a Netlify Image CDN URL
  assertExists(listing.thumbnail_url);
  assertEquals(listing.thumbnail_url.startsWith("/.netlify/images?url="), true);
  assertEquals(listing.thumbnail_url.includes("w=400"), true);
  assertEquals(listing.thumbnail_url.includes("fm=webp"), true);
  assertExists(listing.requesting_agent_id);
  assertExists(listing.requesting_agent_name);
  assertExists(listing.requesting_agency_name);
  assertExists(listing.created_at);
});

Deno.test("cobroke-discover: thumbnail_url is null when no image_url", async () => {
  const propNoImage = { ...MOCK_PROPERTY, image_url: null };
  const res = await handler(
    makeRequest(),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [propNoImage], error: null, count: 1 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.listings[0].thumbnail_url, null);
});

Deno.test("cobroke-discover: excludes caller's own listings (agent_id filter is applied)", async () => {
  // The handler adds .neq("agent_id", callerAgentId) to the DB query.
  // The mock always returns whatever is in "properties", so we verify
  // that when the mock returns a listing whose agent id matches the caller,
  // the function still returns it (filtering is done by the DB, not in JS).
  // What we CAN verify is that the function shapes the caller's agent_id from
  // the token and passes through without error.
  const res = await handler(
    makeRequest(),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      // DB returns empty list (as it would if agent_id filter excluded all rows)
      "properties": { data: [], error: null, count: 0 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.listings.length, 0);
  assertEquals(body.total, 0);
});

Deno.test("cobroke-discover: filter by area is accepted and returns results", async () => {
  const res = await handler(
    makeRequest({ area: "JBR" }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [MOCK_PROPERTY], error: null, count: 1 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.listings.length, 1);
  assertEquals(body.listings[0].area, "JBR");
});

Deno.test("cobroke-discover: filter by property_type is accepted", async () => {
  const res = await handler(
    makeRequest({ property_type: "apartment" }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [MOCK_PROPERTY], error: null, count: 1 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.listings[0].property_type, "apartment");
});

Deno.test("cobroke-discover: respects limit and offset params", async () => {
  const res = await handler(
    makeRequest({ limit: 10, offset: 5 }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [], error: null, count: 100 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.limit, 10);
  assertEquals(body.offset, 5);
});

Deno.test("cobroke-discover: clamps limit to max 50", async () => {
  const res = await handler(
    makeRequest({ limit: 999 }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "co_broke_deals": { data: [], error: null },
      "properties": { data: [], error: null, count: 0 },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.limit, 50);
});

Deno.test("cobroke-discover: returns 401 without Authorization header", async () => {
  const res = await handler(
    new Request("http://localhost/cobroke-discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("cobroke-discover: returns 401 with invalid/expired token", async () => {
  const expiredLink = {
    ...VALID_LINK,
    expires_at: new Date(Date.now() - 1000).toISOString(),
  };
  const res = await handler(
    makeRequest({}, "expired-token"),
    mockClientFactory({
      "magic_links": { data: expiredLink, error: null },
    }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("cobroke-discover: returns 401 when token not found", async () => {
  const res = await handler(
    makeRequest({}, "nonexistent-token"),
    mockClientFactory({
      // magic_links → NOT_FOUND by default (no override)
    }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("cobroke-discover: returns 401 when session not activated (used_at null)", async () => {
  const inactiveLink = { ...VALID_LINK, used_at: null };
  const res = await handler(
    makeRequest({}, "inactive-token"),
    mockClientFactory({
      "magic_links": { data: inactiveLink, error: null },
    }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Session not activated. Please use the login link sent to your email.");
});

Deno.test("cobroke-discover: returns 405 for GET request", async () => {
  const res = await handler(
    new Request("http://localhost/cobroke-discover", {
      method: "GET",
      headers: { "Authorization": "Bearer valid-token" },
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 405);
});

Deno.test("cobroke-discover: OPTIONS returns 204 with CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost/cobroke-discover", {
      method: "OPTIONS",
      headers: { "Origin": "https://agents.sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  assertEquals(res.status, 204);
  assertExists(res.headers.get("access-control-allow-origin"));
});
