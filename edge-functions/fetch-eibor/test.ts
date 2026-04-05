import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl } from '../_shared/test-helpers.ts';

const BASE = fnUrl('fetch-eibor');

Deno.test('fetch-eibor: POST returns 405', async () => {
  const res = await fetch(BASE, { method: 'POST', body: '{}' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('fetch-eibor: GET returns 200 with rate field', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.rate);
  assertExists(body.source);
  assertExists(body.fetched_at);
});

Deno.test('fetch-eibor: rate is a realistic percentage (0.5–15)', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 200);
  const body = await res.json();
  const rate = Number(body.rate);
  assertEquals(isNaN(rate), false);
  assertEquals(rate >= 0.5 && rate <= 15, true);
});

Deno.test('fetch-eibor: source is one of scrape/cache/stale_cache/fallback', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 200);
  const body = await res.json();
  const validSources = ['scrape', 'cache', 'stale_cache', 'fallback'];
  assertEquals(validSources.includes(body.source), true);
});
