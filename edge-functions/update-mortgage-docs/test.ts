import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl, seedAgent, cleanupAgent } from '../_shared/test-helpers.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = fnUrl('update-mortgage-docs');

function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function seedMortgageApp(agentId: string, editToken: string): Promise<string> {
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('mortgage_applications')
    .insert({
      agent_id: agentId,
      buyer_name: 'Test Buyer',
      buyer_phone: '+971501234567',
      edit_token: editToken,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedMortgageApp failed: ${error.message}`);
  return data.id as string;
}

async function cleanupMortgageApp(id: string) {
  const { error } = await supabaseAdmin().from('mortgage_applications').delete().eq('id', id);
  if (error) console.error(`cleanupMortgageApp failed for ${id}: ${error.message}`);
}

Deno.test('update-mortgage-docs: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: missing fields returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'some-id' }), // missing edit_token, doc_type, path
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: invalid doc_type returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'some-id',
      edit_token: 'tok',
      doc_type: 'evil_type',
      path: 'docs/file.pdf',
    }),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: path traversal returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'some-id',
      edit_token: 'tok',
      doc_type: 'passport',
      path: '../etc/passwd',
    }),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: wrong edit_token returns 401', async () => {
  const agent = await seedAgent();
  const appId = await seedMortgageApp(agent.id, 'correct-token-abc');
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appId,
        edit_token: 'wrong-token-xyz',
        doc_type: 'passport',
        path: 'mortgage-docs/passport.pdf',
      }),
    });
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    await cleanupMortgageApp(appId);
    await cleanupAgent(agent.id);
  }
});

Deno.test('update-mortgage-docs: valid request returns 200', async () => {
  const agent = await seedAgent();
  const token = `valid-tok-${Date.now()}`;
  const appId = await seedMortgageApp(agent.id, token);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appId,
        edit_token: token,
        doc_type: 'passport',
        path: 'mortgage-docs/passport.pdf',
      }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
  } finally {
    await cleanupMortgageApp(appId);
    await cleanupAgent(agent.id);
  }
});
