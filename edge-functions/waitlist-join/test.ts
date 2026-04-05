import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl } from '../_shared/test-helpers.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = fnUrl('waitlist-join');

// Helper: clean up waitlist entries created by tests
async function cleanupWaitlist(email: string) {
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  await client.from('waitlist').delete().eq('email', email);
}

Deno.test('waitlist-join: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('waitlist-join: missing name returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: name too short returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'test@example.com' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: invalid email returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'not-an-email' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: valid submission returns success', async () => {
  const email = `wl-test-${Date.now()}@example.com`;
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Test', email }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.duplicate, false);
  await cleanupWaitlist(email);
});

Deno.test('waitlist-join: duplicate email returns duplicate flag', async () => {
  const email = `wl-dup-${Date.now()}@example.com`;
  // First insert
  const first = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Dup', email }),
  });
  if (first.status !== 200) {
    await first.body?.cancel();
    throw new Error(`First insert failed with status ${first.status}`);
  }
  await first.body?.cancel();
  // Second insert — same email
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Dup', email }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.duplicate, true);
  await cleanupWaitlist(email);
});
