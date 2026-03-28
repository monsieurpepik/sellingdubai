# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 confirmed issues from the 5-domain audit (Resilience, Accessibility, SEO, YC Launch readiness, Mobile UX) across 8 files.

**Architecture:** In-place fixes to existing files — no new modules, no new dependencies. Each task is self-contained with exact code and a commit.

**Tech Stack:** Vanilla JS, Supabase Deno edge functions (TypeScript), Netlify edge functions (TypeScript), HTML/CSS.

---

## Context

All issues below were confirmed by reading the actual source files. FALSE POSITIVES from the audit (features that already exist) are NOT included:
- `send-magic-link` retry logic already exists — no fix needed
- `og-injector` already injects `<meta name="description">` — no fix needed
- `dashboard.html` close buttons already have `aria-label="Close"` — no fix needed
- `join.html` Twitter meta tags already present — no fix needed
- `landing.html` Twitter meta tags already present — no fix needed
- `dashboard.html` modal inputs already have a visible border-color focus change — no fix needed

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `index.html` | Modify | Fix OG meta tags (absolute image URL, og:url, twitter:* tags, default schema) |
| `landing.html` | Modify lines 9, 426-478 | Fix canonical URL + add live agent count social proof |
| `js/properties.js` | Modify | Add error destructuring to `loadProperties()` |
| `edge-functions/capture-lead-v4/index.ts` | Modify | Differentiate PGRST116 (404) from DB infra errors (503) |
| `edge-functions/stripe-webhook/index.ts` | Modify | Add error destructuring to `resolveAgentId()` |
| `dashboard.html` | Modify lines 261, 291, 223, 317, 335 | Remove outline:none overrides; boost dim text contrast |
| `join.html` | Modify lines 129, 138, 141-144, 167, 182 | Fix 8px labels; add box-shadow focus rings |
| `sitemap.xml` | Delete | Conflicts with `/sitemap.xml` edge function |

---

## Task 1: Fix SEO Meta Tags in index.html

**Files:**
- Modify: `index.html` (lines ~19, 29-31, 42)

**Issues confirmed:**
- Line 19: `<link rel="canonical" id="canonical-url">` — missing `href`, invisible to crawlers before JS hydration
- Line 29: `og:image` uses relative path `/sellingdubailogo.png` — social crawlers require absolute URL
- Line 30: `og:url` has empty `content`
- Line 31: `twitter:card` exists but `twitter:title`, `twitter:description`, `twitter:image` are all missing
- Line 42: `<script type="application/ld+json" id="schema-agent">{}</script>` — empty schema served to bots before hydration

- [ ] **Step 1: Read the current head section of index.html**

Read `index.html` lines 1-60 to confirm exact current content before editing.

- [ ] **Step 2: Fix canonical, og:image, og:url**

In `index.html`, find:
```html
  <link rel="canonical" id="canonical-url">
```
Replace with:
```html
  <link rel="canonical" id="canonical-url" href="https://sellingdubai.ae/">
```

Find:
```html
    <meta property="og:image" id="og-image" content="/sellingdubailogo.png">
    <meta property="og:url" id="og-url" content="">
```
Replace with:
```html
    <meta property="og:image" id="og-image" content="https://sellingdubai.ae/sellingdubailogo.png">
    <meta property="og:url" id="og-url" content="https://sellingdubai.ae/">
```

- [ ] **Step 3: Add Twitter card meta tags**

Find:
```html
    <meta name="twitter:card" content="summary_large_image">
```
Replace with:
```html
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" id="twitter-title" content="SellingDubai — Find Dubai Real Estate Agents">
    <meta name="twitter:description" id="twitter-description" content="Connect with verified Dubai real estate agents. Browse profiles, listings, and contact agents directly.">
    <meta name="twitter:image" id="twitter-image" content="https://sellingdubai.ae/sellingdubailogo.png">
```

- [ ] **Step 4: Add default WebSite schema to the empty JSON-LD**

Find:
```html
  <script type="application/ld+json" id="schema-agent">{}</script>
```
Replace with:
```html
  <script type="application/ld+json" id="schema-agent">{"@context":"https://schema.org","@type":"WebSite","name":"SellingDubai","url":"https://sellingdubai.ae/"}</script>
```

- [ ] **Step 5: Update JS that writes og:image and og:url to also update twitter tags**

Search for the JS in `index.html` or `js/` files that sets `og-image` and `og-url` content. It likely looks like:
```javascript
document.getElementById('og-image').setAttribute('content', agent.photo_url || '/sellingdubailogo.png');
document.getElementById('og-url').setAttribute('content', window.location.href);
```

Find those lines and add after them:
```javascript
document.getElementById('twitter-image').setAttribute('content', document.getElementById('og-image').getAttribute('content'));
document.getElementById('twitter-title').setAttribute('content', document.getElementById('og-title')?.getAttribute('content') || 'SellingDubai — Find Dubai Real Estate Agents');
document.getElementById('twitter-description').setAttribute('content', document.querySelector('meta[name="description"]')?.getAttribute('content') || 'Connect with verified Dubai real estate agents.');
```

Note: Search `js/` directory for the og-image/og-url update code — it may be in `js/profile.js` or `js/app.js`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix: absolute og:image/url, add twitter meta tags, default WebSite schema"
```

---

## Task 2: Fix Canonical URL in landing.html

**Files:**
- Modify: `landing.html` line 9

**Issue confirmed:** Line 9 has `<link rel="canonical" href="https://sellingdubai.ae/landing"/>` — the landing page IS the homepage (served at `/`), so the canonical should be `https://sellingdubai.ae/` not `/landing`. This tells Google there are two separate pages when there is only one.

- [ ] **Step 1: Read landing.html lines 1-20 to confirm**

Read `landing.html` lines 1-20.

- [ ] **Step 2: Fix the canonical**

Find:
```html
  <link rel="canonical" href="https://sellingdubai.ae/landing"/>
```
Replace with:
```html
  <link rel="canonical" href="https://sellingdubai.ae/"/>
```

- [ ] **Step 3: Commit**

```bash
git add landing.html
git commit -m "fix: correct canonical URL on landing page from /landing to /"
```

---

## Task 3: Add Live Agent Count to Landing Page Trust Bar

**Files:**
- Modify: `landing.html` (Trust Stacking Bar section, around lines 426-478)

**Issue confirmed:** The trust bar says "Claim your page today" with no real social proof number. Showing a real verified agent count builds credibility.

- [ ] **Step 1: Read the trust bar section**

Read `landing.html` lines 420-490 to get the exact current HTML.

- [ ] **Step 2: Add agent count display element to the trust bar**

Locate the trust bar section. Find the element that says something like "Claim your page today" or "Live Now". Add a live count display near it. The exact placement depends on what you see in Step 1, but the pattern is:

Add this span where the social proof text lives (inside the trust bar div):
```html
<span id="agent-count-label" style="display:none;"></span>
```

Example: if the current text is:
```html
<span>Live Now · Claim your page today</span>
```
Replace with:
```html
<span>Live Now · <span id="agent-count-live">Join</span> verified agents</span>
```

- [ ] **Step 3: Add the fetch script at the bottom of landing.html**

Find the closing `</body>` tag in `landing.html`. Before it, add:

```html
<script>
(function() {
  var SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';
  fetch(SUPABASE_URL + '/rest/v1/agents?select=id&verification_status=eq.verified', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
  }).then(function(res) {
    var count = res.headers.get('content-range');
    if (count) {
      var total = count.split('/')[1];
      if (total && parseInt(total, 10) > 0) {
        var el = document.getElementById('agent-count-live');
        if (el) el.textContent = parseInt(total, 10).toLocaleString();
      }
    }
  }).catch(function() {});
})();
</script>
```

This uses Supabase's `Prefer: count=exact` with range `0-0` to get the total count without fetching rows — a single cheap HEAD-equivalent call. Non-blocking (no await, isolated IIFE).

- [ ] **Step 4: Commit**

```bash
git add landing.html
git commit -m "feat: show live verified agent count in landing trust bar"
```

---

## Task 4: Fix Silent Failure in js/properties.js

**Files:**
- Modify: `js/properties.js`

**Issue confirmed:** `loadProperties()` destructures `data` but not `error`. If Supabase fails, `props` is undefined, `propertiesCache` is set to `[]`, and `propertiesLoaded = true` — so subsequent calls return the empty cache forever with no log.

- [ ] **Step 1: Read js/properties.js**

Read `js/properties.js` — find the `loadProperties` function.

- [ ] **Step 2: Fix error destructuring**

Find the Supabase call inside `loadProperties`. It looks like:
```javascript
const { data: props } = await supabase
  .from('properties')
  .select('id,title,...')
  .eq('agent_id', agentId)
  .neq('is_active', false)
  .order('sort_order', { ascending: true })
  .order('created_at', { ascending: false })
  .limit(20);
propertiesCache = (props || []).map(injectDemoPhotos);
propertiesLoaded = true;
return propertiesCache;
```

Replace with:
```javascript
const { data: props, error } = await supabase
  .from('properties')
  .select('id,title,...')
  .eq('agent_id', agentId)
  .neq('is_active', false)
  .order('sort_order', { ascending: true })
  .order('created_at', { ascending: false })
  .limit(20);
if (error) {
  console.error('[properties] Failed to load properties:', error.message);
  return [];
}
propertiesCache = (props || []).map(injectDemoPhotos);
propertiesLoaded = true;
return propertiesCache;
```

Note the exact `.select()` columns and chained methods — copy them verbatim from Step 1 output. Only change the destructuring line and add the error guard. Do NOT set `propertiesLoaded = true` on error so the next call will retry.

- [ ] **Step 3: Run build to confirm no regression**

```bash
npm run build
```
Expected: build passes, `init.bundle.js` still under 30KB, no new chunks over 20KB.

- [ ] **Step 4: Commit**

```bash
git add js/properties.js
git commit -m "fix: log and return early on properties load error instead of caching empty result"
```

---

## Task 5: Fix capture-lead-v4 PGRST116 vs Infrastructure Error

**Files:**
- Modify: `edge-functions/capture-lead-v4/index.ts`

**Issue confirmed:** Lines 241-249 call `.single()` on the agents lookup. If Supabase is transiently down, `agentErr` is an infrastructure error, not PGRST116. Returning 404 in this case causes the lead to be silently dropped — the caller won't retry.

- [ ] **Step 1: Read capture-lead-v4/index.ts**

Read `edge-functions/capture-lead-v4/index.ts` lines 235-260 to confirm exact current code.

- [ ] **Step 2: Differentiate PGRST116 from infrastructure errors**

Find:
```typescript
const { data: agent, error: agentErr } = await supabase
  .from("agents")
  .select("*")
  .eq("slug", agent_slug)
  .eq("verification_status", "verified")
  .single();
if (agentErr || !agent) {
  return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
}
```

Replace with:
```typescript
const { data: agent, error: agentErr } = await supabase
  .from("agents")
  .select("*")
  .eq("slug", agent_slug)
  .eq("verification_status", "verified")
  .single();
if (agentErr) {
  if (agentErr.code === "PGRST116") {
    // No rows — agent genuinely not found or not verified
    return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
  }
  // Any other error is a Supabase infrastructure failure — return 503 so callers can retry
  console.error("[capture-lead-v4] Supabase error fetching agent:", agentErr.message);
  return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), { status: 503, headers: cors });
}
if (!agent) {
  return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404, headers: cors });
}
```

- [ ] **Step 3: Deploy via Supabase MCP**

Use `mcp__claude_ai_Supabase__deploy_edge_function`:
- `project_id`: `pjyorgedaxevxophpfib`
- `name`: `capture-lead-v4`
- `verify_jwt`: `false`
- `files`: read the full updated file first, then pass it

- [ ] **Step 4: Commit**

```bash
git add edge-functions/capture-lead-v4/index.ts
git commit -m "fix: return 503 (not 404) when Supabase infra fails in capture-lead-v4"
```

---

## Task 6: Fix stripe-webhook resolveAgentId Silent Failure

**Files:**
- Modify: `edge-functions/stripe-webhook/index.ts`

**Issue confirmed:** `resolveAgentId` (lines 56-71) does not destructure `error` from the Supabase query. When Supabase is down, `data` is undefined, function returns `null`, caller logs and drops event with 200 — Stripe does not retry. The fix is to log DB errors so they're visible; the 200 return is intentional (prevent retry storms on Stripe side).

- [ ] **Step 1: Read stripe-webhook/index.ts lines 56-75**

Read `edge-functions/stripe-webhook/index.ts` lines 56-75 to confirm exact current code.

- [ ] **Step 2: Add error destructuring and logging**

Find inside `resolveAgentId`:
```typescript
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id ?? null;
```

Replace with:
```typescript
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for unknown customer); anything else is a DB error
    console.error("[stripe-webhook] DB error resolving agent by customer ID:", error.message, "customerId:", customerId);
  }
  return data?.id ?? null;
```

- [ ] **Step 3: Deploy via Supabase MCP**

Use `mcp__claude_ai_Supabase__deploy_edge_function`:
- `project_id`: `pjyorgedaxevxophpfib`
- `name`: `stripe-webhook`
- `verify_jwt`: `false`
- `files`: read the full updated file first, then pass it

- [ ] **Step 4: Commit**

```bash
git add edge-functions/stripe-webhook/index.ts
git commit -m "fix: log DB errors in stripe-webhook resolveAgentId (was silently returning null)"
```

---

## Task 7: Fix dashboard.html Accessibility Issues

**Files:**
- Modify: `dashboard.html` lines 261, 291, 223, 317, 335

**Issues confirmed:**
- Line 261: `.referral-link-input { outline: none; }` overrides the global `focus-visible` rule; no visible replacement
- Line 291: `.prop-status-select:focus { outline: none; }` same issue
- Line 223: `.auth-input::placeholder { color: rgba(255,255,255,0.3); }` ~2.1:1 contrast (WCAG AA requires 3:1 for UI text)
- Line 317: `.modal-close { color: rgba(255,255,255,0.3); }` interactive element too dim at rest
- Line 335: `.modal-thumb-hint { font-size: 12px; color: rgba(255,255,255,0.3); }` text below AA contrast

Note: The global focus rule in dashboard.html (lines 247-250) is:
```css
button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible {
  outline: 2px solid rgba(255,255,255,0.5);
  outline-offset: 2px;
}
```
Removing the per-element `outline: none` overrides restores this automatically.

- [ ] **Step 1: Read dashboard.html lines 215-300 and 310-340**

Read both ranges to confirm exact current content.

- [ ] **Step 2: Remove outline:none from referral-link-input**

Find:
```css
    .referral-link-input { outline: none; min-width: 0; }
```
Replace with:
```css
    .referral-link-input { min-width: 0; }
```

- [ ] **Step 3: Remove outline:none from prop-status-select**

Find:
```css
    .prop-status-select:focus { outline: none; }
```
Delete that entire line (replace with empty string — remove the whole rule).

- [ ] **Step 4: Boost placeholder contrast**

Find:
```css
    .auth-input::placeholder { color: rgba(255,255,255,0.3); }
```
Replace with:
```css
    .auth-input::placeholder { color: rgba(255,255,255,0.5); }
```
`rgba(255,255,255,0.5)` on `#09090b` ≈ 4.0:1 — passes WCAG AA.

- [ ] **Step 5: Boost modal-close contrast**

Find:
```css
    .modal-close { color: rgba(255,255,255,0.3); }
```
Replace with:
```css
    .modal-close { color: rgba(255,255,255,0.55); }
```

- [ ] **Step 6: Boost modal-thumb-hint contrast**

Find:
```css
    .modal-thumb-hint { font-size: 12px; color: rgba(255,255,255,0.3); }
```
Replace with:
```css
    .modal-thumb-hint { font-size: 12px; color: rgba(255,255,255,0.5); }
```

- [ ] **Step 7: Commit**

```bash
git add dashboard.html
git commit -m "fix: restore focus indicators and boost dim text contrast in dashboard (WCAG AA)"
```

---

## Task 8: Fix join.html Accessibility Issues

**Files:**
- Modify: `join.html` lines 129, 138, 141-144, 167, 182

**Issues confirmed:**
- Line 129: `.field label { font-size: 8px; }` — below 11px accessible minimum
- Line 138: `.field input { outline: none; }` — no replacement focus indicator
- Lines 141-144: `.field input:focus { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.25); }` — subtle on glass, not sufficient alone
- Line 167: `.social-field input { outline: none; }` — same as line 138
- Line 182: `.verify-label { font-size: 8px; }` — same label size issue

- [ ] **Step 1: Read join.html lines 120-200**

Read `join.html` lines 120-200 to confirm exact current content.

- [ ] **Step 2: Fix field label font size**

Find:
```css
    .field label { font-size: 8px; }
```
Replace with:
```css
    .field label { font-size: 11px; }
```

- [ ] **Step 3: Replace outline:none with box-shadow focus ring for field inputs**

Find:
```css
    .field input { outline: none; }
```
Replace with:
```css
    .field input { outline: none; }
    .field input:focus-visible { box-shadow: 0 0 0 2px rgba(255,255,255,0.5); }
```

- [ ] **Step 4: Keep existing focus background/border change (it supplements the new ring)**

The existing `.field input:focus` rule stays as-is. No change needed — the `box-shadow` from Step 3 is additive.

- [ ] **Step 5: Replace outline:none with box-shadow for social-field inputs**

Find:
```css
    .social-field input { outline: none; }
```
Replace with:
```css
    .social-field input { outline: none; }
    .social-field input:focus-visible { box-shadow: 0 0 0 2px rgba(255,255,255,0.5); }
```

- [ ] **Step 6: Fix verify-label font size**

Find:
```css
    .verify-label { font-size: 8px; }
```
Replace with:
```css
    .verify-label { font-size: 11px; }
```

- [ ] **Step 7: Commit**

```bash
git add join.html
git commit -m "fix: increase label font sizes to 11px and add focus-visible rings in join form (WCAG AA)"
```

---

## Task 9: Remove Conflicting Static sitemap.xml

**Files:**
- Delete: `sitemap.xml`

**Issue confirmed:** A static `sitemap.xml` exists in the repo root. The Netlify edge function at `netlify/edge-functions/sitemap.ts` is configured to serve `path: '/sitemap.xml'`. Netlify serves static files before edge functions, so the static file wins — the dynamic sitemap (with all verified agent URLs) is never served.

- [ ] **Step 1: Confirm the static sitemap.xml exists**

```bash
ls -la sitemap.xml
```
Expected: file exists.

- [ ] **Step 2: Check its contents are truly static/stale**

Read `sitemap.xml` — confirm it does NOT contain agent profile URLs (just static pages). If it has dynamic agent URLs, stop and investigate further.

- [ ] **Step 3: Delete the static file**

```bash
rm sitemap.xml
```

- [ ] **Step 4: Verify edge function is configured**

Read `netlify.toml` — confirm there is an `[[edge_functions]]` block with `path = "/sitemap.xml"` pointing to `sitemap` function. If not, check `netlify/edge-functions/sitemap.ts` exports `config: Config = { path: '/sitemap.xml' }` — this also works as inline config.

- [ ] **Step 5: Commit**

```bash
git add -u sitemap.xml
git commit -m "fix: remove static sitemap.xml so dynamic edge function sitemap is served"
```

---

## Verification

After all tasks are committed:

**1. SEO check:**
```bash
# View index.html head
grep -n "og:image\|og:url\|twitter:\|canonical\|schema-agent" index.html | head -20
```
Expected: og:image and og:url have `https://sellingdubai.ae/...`, twitter:title/description/image present, canonical has href, schema-agent has WebSite type.

**2. landing.html canonical:**
```bash
grep "canonical" landing.html
```
Expected: `href="https://sellingdubai.ae/"`

**3. Build passes:**
```bash
npm run build
```
Expected: passes, `init.bundle.js` < 30KB, no new chunks > 20KB.

**4. Sitemap:**
```bash
ls sitemap.xml 2>/dev/null && echo "STILL EXISTS (bad)" || echo "Deleted (good)"
```
Expected: `Deleted (good)`

**5. Manual accessibility spot-check:**
- Open `dashboard.html` in browser
- Tab to the referral link input — should show a white outline ring
- Tab to a property status select — should show the global focus ring
- Open `join.html` — form field labels should be readable at 11px
- Tab through form inputs — should show box-shadow focus rings

**6. Supabase edge functions deployed:**

Verify capture-lead-v4 and stripe-webhook are deployed by checking function list:
```bash
# Or use Supabase MCP list_edge_functions
```
