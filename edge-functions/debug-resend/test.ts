import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

Deno.test("debug-resend: always returns 404", async () => {
  const res = await handler(new Request("http://localhost", { method: "GET" }));
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "Not found");
});

Deno.test("debug-resend: POST also returns 404", async () => {
  const res = await handler(new Request("http://localhost", { method: "POST" }));
  assertEquals(res.status, 404);
});

Deno.test("debug-resend: response is JSON", async () => {
  const res = await handler(new Request("http://localhost", { method: "GET" }));
  assertEquals(res.headers.get("Content-Type"), "application/json");
});
