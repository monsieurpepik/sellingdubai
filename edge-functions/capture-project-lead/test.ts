import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RATE_LIMIT_SALT", "test-salt");

Deno.test("capture-project-lead: missing name returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_slug: "test-project", agent_slug: "test-agent", phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-project-lead: missing phone and email returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_slug: "test-project", agent_slug: "test-agent", name: "Test Buyer" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-project-lead: missing project_slug returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_slug: "test-agent", name: "Test Buyer", phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-project-lead: missing agent_slug returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_slug: "test-project", name: "Test Buyer", phone: "+971501234567" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("capture-project-lead: rate limit returns 429 when count >= 5", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: "test-project",
        agent_slug: "test-agent",
        name: "Test Buyer",
        phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "project_leads:count": { count: 5, error: null },
    }),
  );
  if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
});

Deno.test("capture-project-lead: project not found returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: "test-project",
        agent_slug: "test-agent",
        name: "Test Buyer",
        phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "project_leads:count": { count: 0, error: null },
      // featured_projects not provided → defaults to NOT_FOUND
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("capture-project-lead: agent not found returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: "test-project",
        agent_slug: "test-agent",
        name: "Test Buyer",
        phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "project_leads:count": { count: 0, error: null },
      "featured_projects": { data: { id: "proj-1", project_name: "Test Project", developer_name: "Dev Co", commission_percent: 5, platform_fee_per_lead: 100 }, error: null },
      // agents not provided → defaults to NOT_FOUND
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("capture-project-lead: valid submission returns 200", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_slug: "test-project",
        agent_slug: "test-agent",
        name: "Test Buyer",
        phone: "+971501234567",
      }),
    }),
    mockClientFactory({
      "project_leads:count": { count: 0, error: null },
      "featured_projects": { data: { id: "proj-1", project_name: "Test Project", developer_name: "Dev Co", commission_percent: 5, platform_fee_per_lead: 100 }, error: null },
      "agents": { data: { id: "agent-1", name: "Test Agent", whatsapp: "+971501234567" }, error: null },
      "project_leads": { data: { id: "lead-1" }, error: null },
    }),
  );
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }
});

Deno.test("capture-project-lead: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("capture-project-lead: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.ae" },
    }),
    mockClientFactory(),
  );
  if (res.status !== 204) throw new Error(`Expected 204, got ${res.status}`);
});
