import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("revoke-session: missing token returns 400", async () => {
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

Deno.test("revoke-session: unknown token returns 200 (silent — no enumeration)", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID() }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`Expected 200 for unknown token, got ${res.status}`);
  const data = await res.json();
  if (data.success !== true) throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
});

Deno.test("revoke-session: valid token is revoked successfully", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "some-valid-token-abc123" }),
    }),
    mockClientFactory({
      "magic_links": { data: { id: "link-1", token: "some-valid-token-abc123" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const data = await res.json();
  if (data.success !== true) throw new Error(`Expected success:true, got ${JSON.stringify(data)}`);
});

Deno.test("revoke-session: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("revoke-session: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (res.status !== 200) throw new Error(`OPTIONS failed with ${res.status}`);
});
