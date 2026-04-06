# Staging Environment Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `staging.sellingdubai.com` backed by Supabase project `lhrtdlxqbdxrfvjeoxrt`, deploy all edge functions there, seed the load-test agent, and prove k6 passes SLOs against staging.

**Architecture:** Netlify branch deploy for the `staging` git branch gets a custom subdomain. Build-time env vars point the `dist/release-config.js` bundle at the staging Supabase project. Edge functions are deployed via Supabase CLI to the staging project ref. k6 runs against the fully wired staging environment.

**Tech Stack:** Netlify CLI, Supabase CLI, Deno (seed script), k6

---

### Task 1: Confirm staging branch deploy is live

**Files:**
- No code changes — verification only

- [ ] **Step 1: Check Netlify site ID**

```bash
netlify status
```

Expected: shows `Site Id` and `Site Name`. Note the site name (e.g. `sellingdubai-ae`).

- [ ] **Step 2: List recent deploys and find the staging branch URL**

```bash
netlify deploy:list --json 2>/dev/null | head -40
```

Or check the Netlify UI → Deploys → filter by branch "staging". The staging branch deploy URL will be `https://staging--<site-name>.netlify.app`.

- [ ] **Step 3: Confirm the staging URL returns 200**

```bash
curl -s -o /dev/null -w "%{http_code}" https://staging--sellingdubai-ae.netlify.app/
```

Expected: `200`. If you get `404` or `301`, the staging branch hasn't deployed yet — trigger it:

```bash
git checkout staging && git push origin staging
```

Then wait for Netlify to finish the deploy (watch at Netlify UI → Deploys).

- [ ] **Step 4: Note the exact staging deploy URL for the next task**

Write it down: `https://staging--<site-name>.netlify.app` (you'll need it for the CNAME value).

---

### Task 2: Assign `staging.sellingdubai.com` custom domain + DNS CNAME

**Files:**
- No code changes — Netlify UI + DNS configuration

- [ ] **Step 1: Open Netlify site → Domain management**

Navigate in the Netlify UI:
1. Go to your site → **Site configuration** → **Domain management**
2. Scroll to **Branch subdomains** (or **Domain aliases**)
3. Click **Add domain alias**
4. Enter: `staging.sellingdubai.com`
5. Click **Save**

- [ ] **Step 2: Add DNS CNAME record**

In the DNS provider for `sellingdubai.ae` / `sellingdubai.com` (or Netlify DNS if the zone is managed there):

| Type  | Name      | Value                                        | TTL  |
|-------|-----------|----------------------------------------------|------|
| CNAME | `staging` | `staging--<your-site-name>.netlify.app.`     | 300  |

Replace `<your-site-name>` with the actual Netlify site slug from Task 1.

- [ ] **Step 3: Verify DNS propagation (allow 1–5 minutes)**

```bash
dig staging.sellingdubai.com CNAME +short
```

Expected output: `staging--<site-name>.netlify.app.`

- [ ] **Step 4: Confirm HTTPS works**

```bash
curl -s -o /dev/null -w "%{http_code}" https://staging.sellingdubai.com/
```

Expected: `200`. Netlify provisions the TLS cert automatically once DNS resolves.

---

### Task 3: Set staging Supabase env vars in Netlify (build-time)

**Files:**
- No code changes — Netlify environment variables

The `npm run build` command reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` to bake into `dist/release-config.js`. The staging branch needs these pointing at `lhrtdlxqbdxrfvjeoxrt`.

- [ ] **Step 1: Get the staging Supabase anon key**

In the Supabase dashboard for project `lhrtdlxqbdxrfvjeoxrt`:
→ Project Settings → API → `anon` `public` key

Copy the key.

- [ ] **Step 2: Set env vars for the staging branch context**

```bash
netlify env:set SUPABASE_URL "https://lhrtdlxqbdxrfvjeoxrt.supabase.co" --context branch:staging
netlify env:set SUPABASE_ANON_KEY "<paste-staging-anon-key>" --context branch:staging
```

If your Netlify CLI version doesn't support `--context branch:staging`, use the UI:
- Site configuration → Environment variables → Add variable
- Set scope to "Branch deploys" or specifically "staging" branch.

- [ ] **Step 3: Trigger a fresh staging deploy to pick up the new env vars**

```bash
git checkout staging
git commit --allow-empty -m "chore: trigger staging redeploy with new env vars"
git push origin staging
```

- [ ] **Step 4: Verify `dist/release-config.js` on staging uses the staging URL**

```bash
curl -s https://staging.sellingdubai.com/dist/release-config.js
```

Expected output (approximately):

```js
window.__SD_SUPABASE_URL__ = "https://lhrtdlxqbdxrfvjeoxrt.supabase.co";
```

If it still shows the prod URL `pjyorgedaxevxophpfib`, the env var wasn't scoped correctly — check the Netlify UI.

---

### Task 4: Deploy edge functions to staging Supabase project

**Files:**
- No code changes — Supabase CLI deploy

All functions in `edge-functions/` (symlinked as `supabase/functions/`) need to be deployed to `lhrtdlxqbdxrfvjeoxrt`.

- [ ] **Step 1: Confirm Supabase CLI is linked to the correct project**

```bash
supabase projects list
```

Note the ref `lhrtdlxqbdxrfvjeoxrt` appears in the list.

- [ ] **Step 2: Deploy all functions to staging**

```bash
supabase functions deploy --project-ref lhrtdlxqbdxrfvjeoxrt
```

Expected: each function listed with `Deployed` status. This deploys everything in `supabase/functions/` (which is the symlink to `edge-functions/`).

- [ ] **Step 3: Set required secrets on staging project**

```bash
supabase secrets set --project-ref lhrtdlxqbdxrfvjeoxrt \
  SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>" \
  RESEND_API_KEY="<resend-key>"
```

Get the staging service role key from Supabase dashboard → `lhrtdlxqbdxrfvjeoxrt` → Settings → API → `service_role` key.

`RESEND_API_KEY` can be the same as production (emails will still go to real addresses — that's fine for staging; the waitlist-join function guards against duplicate submissions).

- [ ] **Step 4: Smoke-test one function to confirm deploy worked**

```bash
curl -s -X POST \
  https://lhrtdlxqbdxrfvjeoxrt.supabase.co/functions/v1/waitlist-join \
  -H "Content-Type: application/json" \
  -d '{"name":"Staging Test","email":"staging-probe@sellingdubai.com","whatsapp":null}' \
  | jq .
```

Expected: `{"success":true,"duplicate":false,"count":<number>}` or `{"success":true,"duplicate":true,...}` on re-run. A `500` or connection error means the function didn't deploy or secrets are missing.

---

### Task 5: Seed load test agent on staging

**Files:**
- No code changes — run `scripts/seed-loadtest-agent.ts`

- [ ] **Step 1: Get the staging service role key** (if not already from Task 4)

Supabase dashboard → project `lhrtdlxqbdxrfvjeoxrt` → Settings → API → `service_role` key.

- [ ] **Step 2: Run the seed script against staging**

```bash
SUPABASE_URL="https://lhrtdlxqbdxrfvjeoxrt.supabase.co" \
SUPABASE_SERVICE_KEY="<staging-service-role-key>" \
deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
```

Expected output:

```
Load test agent ready:
  ID:    <uuid>
  Email: loadtest@sellingdubai.com
  BRN:   TEST-123

Set this in load-test.sh:
  TEST_AGENT_ID=<uuid>
```

- [ ] **Step 3: Copy the UUID — you'll need it in the next two tasks**

---

### Task 6: Set LOADTEST_AGENT_ID in Netlify staging env

**Files:**
- No code changes — Netlify environment variable

- [ ] **Step 1: Set the env var for the staging branch context**

```bash
netlify env:set LOADTEST_AGENT_ID "<uuid-from-task-5>" --context branch:staging
```

Or via Netlify UI → Site configuration → Environment variables → add `LOADTEST_AGENT_ID` scoped to the `staging` branch.

- [ ] **Step 2: Verify it's set**

```bash
netlify env:list --context branch:staging | grep LOADTEST
```

Expected: `LOADTEST_AGENT_ID  <uuid>`

---

### Task 7: Run k6 load test against staging and document results

**Files:**
- Create: `scripts/LOAD-TEST-RESULTS.md` (results document)

- [ ] **Step 1: Confirm k6 is installed**

```bash
k6 version
```

Expected: `k6 v0.x.x` (any recent version). If missing: `brew install k6`

- [ ] **Step 2: Run the load test against staging**

```bash
BASE_URL="https://staging.sellingdubai.com" \
SUPABASE_URL="https://lhrtdlxqbdxrfvjeoxrt.supabase.co/functions/v1" \
TEST_AGENT_ID="<uuid-from-task-5>" \
bash scripts/load-test.sh
```

The test ramps to 100 VUs over ~4 minutes. Watch the terminal for live metrics.

- [ ] **Step 3: Confirm SLOs pass**

The load test script will exit with code 1 if any threshold fails. Expected pass criteria (from `scripts/load-test.js`):
- `capture-lead` p(95) < 800ms
- `send-magic-link`, `manage-properties`, agent page GET: p(95) < 1000ms
- All endpoints: error rate < 1%

If any threshold fails, the output shows which scenario failed and the actual p(95) value. Do not proceed to production until all SLOs pass on staging.

- [ ] **Step 4: Create `scripts/LOAD-TEST-RESULTS.md` with the results**

```bash
cat > scripts/LOAD-TEST-RESULTS.md << 'EOF'
# Load Test Results — Staging

**Date:** 2026-04-06
**Environment:** https://staging.sellingdubai.com
**Supabase project:** lhrtdlxqbdxrfvjeoxrt

## Results

| Scenario         | p(95) ms | Error rate | SLO       | Status |
|-----------------|----------|------------|-----------|--------|
| capture-lead     |          |            | <800ms 1% |        |
| send-magic-link  |          |            | <1000ms 1%|        |
| manage-properties|          |            | <1000ms 1%|        |
| agent-page-get   |          |            | <1000ms 1%|        |

Fill in values from `scripts/load-test-results.json` (generated by load-test.sh).

## Notes

<!-- Any observations about staging behaviour -->
EOF
```

Fill in the table from the JSON output at `scripts/load-test-results.json`:

```bash
# Extract p95 for capture-lead scenario
cat scripts/load-test-results.json | jq '[.metrics | to_entries[] | select(.key | test("http_req_duration.*capture")) | .value.values["p(95)"]] | first'
```

- [ ] **Step 5: Commit results**

```bash
git add scripts/LOAD-TEST-RESULTS.md
git commit -m "chore: add k6 load test results for staging

All SLOs pass at 100 VU peak against lhrtdlxqbdxrfvjeoxrt.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
