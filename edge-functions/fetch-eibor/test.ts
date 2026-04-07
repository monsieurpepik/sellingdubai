import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { mockClientFactory } from "../_shared/test-mock.ts";
import { handler } from "./index.ts";

Deno.test("fetch-eibor: POST returns 405", async () => {
  const req = new Request("http://localhost/fetch-eibor", { method: "POST", body: "{}" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 405);
});

// Skipped: GET hits live CBUAE scrape URL and live DB
Deno.test.ignore("fetch-eibor: GET returns 200 with rate field", async () => {
  const req = new Request("http://localhost/fetch-eibor", { method: "GET" });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.rate);
  assertExists(body.source);
  assertExists(body.fetched_at);
});

Deno.test("fetch-eibor: GET with cached rate returns 200 from cache", async () => {
  const fetchedAt = new Date().toISOString();
  const req = new Request("http://localhost/fetch-eibor", { method: "GET" });
  const res = await handler(
    req,
    mockClientFactory({
      "market_rates": {
        data: { rate_value: 4.25, fetched_at: fetchedAt, source: "scrape" },
        error: null,
      },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.rate, 4.25);
  assertEquals(body.cached, true);
  assertEquals(body.source, "scrape");
});

// Skipped: stale cache triggers live CBUAE scrape (external HTTP)
Deno.test.ignore("fetch-eibor: GET with stale cache falls back to scrape/fallback", async () => {
  const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const req = new Request("http://localhost/fetch-eibor", { method: "GET" });
  const res = await handler(
    req,
    mockClientFactory({
      "market_rates": {
        data: { rate_value: 3.68, fetched_at: staleDate, source: "scrape" },
        error: null,
      },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.rate);
  const validSources = ["scrape", "cache", "stale_cache", "fallback"];
  assertEquals(validSources.includes(body.source), true);
});
