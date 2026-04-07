import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "");

const VALID_LINK = {
  agent_id: "agent-listing",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: "2024-01-01T00:00:00Z",
};

const VALID_MATCH = {
  id: "match-1",
  listing_agent_id: "agent-listing",
  buying_agent_id: "agent-buying",
  property_id: "prop-1",
  buyer_request_id: "req-1",
  status: "notified",
  listing_agent: { id: "agent-listing", name: "Listing Agent", slug: "listing", email: "listing@example.com" },
  buying_agent: { id: "agent-buying", name: "Buying Agent", slug: "buying", email: "buying@example.com" },
  property: { id: "prop-1", title: "Test Villa", location: "Dubai Marina", price: "AED 2,000,000", cobroke_commission_split: 50 },
  buyer_request: { id: "req-1", buyer_name: "Test Buyer" },
};

Deno.test("respond-to-match: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("respond-to-match: no Authorization header returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: "some-id", action: "interested" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("respond-to-match: invalid token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer totally-invalid-token",
      },
      body: JSON.stringify({ match_id: "some-id", action: "interested" }),
    }),
    mockClientFactory(), // magic_links defaults to NOT_FOUND
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("respond-to-match: missing match_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ action: "interested" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "property_matches:count": { count: 0, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("respond-to-match: unknown match_id returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ match_id: "00000000-0000-0000-0000-000000000000", action: "interested" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "property_matches:count": { count: 0, error: null },
      // property_matches single() defaults to NOT_FOUND
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("respond-to-match: wrong agent (not listing agent) returns 403", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ match_id: "match-1", action: "interested" }),
    }),
    mockClientFactory({
      "magic_links": {
        data: { agent_id: "agent-buying", expires_at: "2099-01-01T00:00:00Z", used_at: "2024-01-01T00:00:00Z" },
        error: null,
      },
      "property_matches:count": { count: 0, error: null },
      "property_matches": { data: VALID_MATCH, error: null },
    }),
  );
  if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
});

Deno.test("respond-to-match: declined action returns 200 with declined status", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ match_id: "match-1", action: "declined" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "property_matches:count": { count: 0, error: null },
      "property_matches": { data: VALID_MATCH, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.status !== "declined") throw new Error(`Expected status declined, got: ${JSON.stringify(data)}`);
});

Deno.test("respond-to-match: interested action returns 200 with connected status", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer some-token",
      },
      body: JSON.stringify({ match_id: "match-1", action: "interested" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "property_matches:count": { count: 0, error: null },
      "property_matches": { data: VALID_MATCH, error: null },
      "co_broke_deals": { data: { id: "deal-1" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.status !== "connected") throw new Error(`Expected status connected, got: ${JSON.stringify(data)}`);
  if (!data.ok) throw new Error(`Expected ok:true, got: ${JSON.stringify(data)}`);
});
