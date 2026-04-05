import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl, seedAgent, cleanupAgent, seedUsedMagicLink } from '../_shared/test-helpers.ts';

const BASE = fnUrl('respond-to-match');

Deno.test('respond-to-match: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('respond-to-match: no Authorization header returns 401', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: 'some-id', action: 'interested' }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('respond-to-match: invalid token returns 401', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer totally-invalid-token',
    },
    body: JSON.stringify({ match_id: 'some-id', action: 'interested' }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('respond-to-match: missing match_id returns 400', async () => {
  const agent = await seedAgent();
  const link = await seedUsedMagicLink(agent.id);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${link.token}`,
      },
      body: JSON.stringify({ action: 'interested' }), // missing match_id
    });
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id);
  }
});

Deno.test('respond-to-match: unknown match_id returns 404', async () => {
  const agent = await seedAgent();
  const link = await seedUsedMagicLink(agent.id);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${link.token}`,
      },
      body: JSON.stringify({
        match_id: '00000000-0000-0000-0000-000000000000',
        action: 'interested',
      }),
    });
    assertEquals(res.status, 404);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id);
  }
});
