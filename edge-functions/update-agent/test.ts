import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const VALID_LINK = {
  id: "link-1",
  agent_id: "agent-1",
  used_at: new Date().toISOString(),
  revoked_at: null,
  expires_at: "2099-01-01T00:00:00Z",
};

const VALID_AGENT = {
  id: "agent-1",
  slug: "test-agent",
  tier: "free",
  name: "Test Agent",
  tagline: "Original tagline",
};

Deno.test("update-agent: valid token updates allowed fields", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", updates: { tagline: "Test tagline" } }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents:write": { data: { ...VALID_AGENT, tagline: "Test tagline" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.agent?.tagline !== "Test tagline") {
    throw new Error(`Expected tagline "Test tagline", got: ${JSON.stringify(data.agent?.tagline)}`);
  }
});

Deno.test("update-agent: missing token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: { tagline: "x" } }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("update-agent: disallowed field is filtered out", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", updates: { tier: "pro" } }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
      "agents:write": { data: { ...VALID_AGENT, tier: "free" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.agent?.tier !== "free") {
    throw new Error(`Expected tier to remain "free", got: ${JSON.stringify(data.agent?.tier)}`);
  }
});

Deno.test("update-agent: name too long returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", updates: { name: "x".repeat(101) } }),
    }),
    mockClientFactory({
      "magic_links": { data: VALID_LINK, error: null },
    }),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-agent: invalid token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token", updates: { tagline: "x" } }),
    }),
    mockClientFactory(), // magic_links defaults to NOT_FOUND
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("update-agent: unused session token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "unused-token", updates: { tagline: "x" } }),
    }),
    mockClientFactory({
      "magic_links": {
        data: { ...VALID_LINK, used_at: null },
        error: null,
      },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});
