import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: "2099-01-01T00:00:00Z",
  used_at: new Date().toISOString(),
};

Deno.test("update-lead-status: missing token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: "some-id", status: "contacted" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("update-lead-status: invalid token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token", lead_id: "some-id", status: "contacted" }),
    }),
    mockClientFactory(), // magic_links defaults to NOT_FOUND
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("update-lead-status: missing lead_id returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", status: "contacted" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-lead-status: invalid status returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", lead_id: "some-id", status: "purple" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-lead-status: non-existent lead returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", lead_id: "unknown-lead", status: "contacted" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      // leads defaults to NOT_FOUND
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404 for unknown lead, got ${res.status}`);
});

Deno.test("update-lead-status: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});

Deno.test("update-lead-status: valid request updates lead status", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", lead_id: "lead-1", status: "contacted" }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "leads:write": { data: { id: "lead-1", status: "contacted" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
});
