import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("verify-magic-link: valid token resolves to agent", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-abc" }),
    }),
    mockClientFactory({
      "magic_links": {
        data: {
          id: "link-1",
          agent_id: "agent-1",
          used_at: null,
          revoked_at: null,
          expires_at: "2099-01-01T00:00:00Z",
        },
        error: null,
      },
      "agents": {
        data: { id: "agent-1", slug: "test-agent", tier: "free", name: "Test Agent" },
        error: null,
      },
      "magic_links:write": { data: null, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (!data.agent || data.agent.id !== "agent-1") {
    throw new Error(`Expected agent.id agent-1, got: ${JSON.stringify(data.agent)}`);
  }
});

Deno.test("verify-magic-link: missing token returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("verify-magic-link: unknown token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "unknown-token" }),
    }),
    mockClientFactory(), // magic_links defaults to NOT_FOUND
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("verify-magic-link: expired token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "expired-token" }),
    }),
    mockClientFactory({
      "magic_links": {
        data: {
          id: "link-2",
          agent_id: "agent-1",
          used_at: null,
          revoked_at: null,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
        error: null,
      },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});
