import { fnUrl, seedAgent } from "../_shared/test-helpers.ts";
import { cleanupAgent } from "../_shared/test-helpers.ts";

const URL = fnUrl("log-event");

Deno.test("log-event: missing agent_id returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "view" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("log-event: missing event_type returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: crypto.randomUUID() }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("log-event: valid view event is accepted", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agent.id, event_type: "view" }),
    });
    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (data.success !== true) throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("log-event: GET returns 405", async () => {
  const res = await fetch(URL, { method: "GET" });
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
  await res.body?.cancel();
});
