// scripts/seed-loadtest-agent.ts
// Idempotent seeder for the load test agent record.
// Run once before executing the load test:
//   deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
//
// Required env:
//   SUPABASE_URL          e.g. https://pjyorgedaxevxophpfib.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key (never the anon key)
//
// Output: prints the agent UUID to use as TEST_AGENT_ID in load-test.sh

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.');
  Deno.exit(1);
}

const AGENT = {
  email:               'loadtest@sellingdubai.com',
  name:                'Load Test Agent',
  slug:                'loadtest',
  rera_brn:            'TEST-123',
  phone:               '+971501234567',
  agency_name:         'Load Test Agency',
  verification_status: 'verified',
  is_active:           true,
  tier:                'premium',
};

const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?on_conflict=slug`, {
  method:  'POST',
  headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
    'Prefer':        'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(AGENT),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`ERROR: upsert failed (${res.status}): ${body}`);
  Deno.exit(1);
}

const rows = await res.json() as Array<{ id: string }>;
const agent = rows[0];

if (!agent?.id) {
  console.error('ERROR: upsert returned no rows.');
  Deno.exit(1);
}

console.log(`\nLoad test agent ready:`);
console.log(`  ID:    ${agent.id}`);
console.log(`  Slug:  ${AGENT.slug}`);
console.log(`  Email: ${AGENT.email}`);
console.log(`\nThe load test uses slug '${AGENT.slug}' by default — no env var needed.`);
console.log(`To override: export TEST_AGENT_SLUG=${AGENT.slug}`);
