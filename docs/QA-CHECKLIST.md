# QA Checklist — SellingDubai

Run this checklist before every deploy. Each item has an exact URL, action, expected result, and verification method.

---

## Test Credentials

These bypass real DLD and email infrastructure. They only work when `ENABLE_TEST_MODE=true` is set as a Supabase project secret. **Never set this flag in production.**

| What | Value | Notes |
|------|-------|-------|
| Test BRN | `00000` | Skips DLD registry lookup. Returns Name: `Test Agent`, Agency: `Test Agency`. |
| Test email | `boban@sellingdubai.com` | OTP is always `123456`. No email is sent — code is stored directly in DB. |

To activate: set `ENABLE_TEST_MODE=true` in Supabase Dashboard → Edge Functions → Secrets (applies to all functions).

---

## Journey 1 — Agent Signup (`/join`)

### Step 1: DLD Broker Verification

- [ ] **URL:** `https://www.sellingdubai.com/join`
  - **Action:** Open the page
  - **Expected:** Step 1 visible (broker number input + "Verify My License" button); Steps 2 and 3 hidden
  - **Verify:** `#step-1` is visible; `#step-2` and `#step-3` have `display:none`

- [ ] **URL:** `https://www.sellingdubai.com/join`
  - **Action:** Enter an invalid broker number (e.g. `000000`) → click Verify
  - **Expected:** Error message shown ("Broker not found" or similar); stays on Step 1
  - **Verify:** `#step-1-error` visible with non-empty text; no navigation to Step 2

- [ ] **URL:** `https://www.sellingdubai.com/join`
  - **Action:** Enter a valid DLD broker number → click Verify
  - **Expected:** Loading state on button; then Step 2 appears with pre-filled name from DLD
  - **Verify:** `#step-2` becomes visible; `#agent-name` field has value matching DLD record; `#step-1` hidden

### Step 2: Identity Confirmation + OTP + Profile Details

- [ ] **URL:** `https://www.sellingdubai.com/join` (after Step 1 passes)
  - **Action:** Confirm displayed broker name → fill in email, WhatsApp → click "Send Verification Code"
  - **Expected:** OTP sent to email; resend button shows 60-second countdown (`Resend code (60s)`)
  - **Verify:** Countdown ticks from 60 to 0; at 0, button re-enables with "Didn't get it? Resend code"

- [ ] **URL:** `https://www.sellingdubai.com/join` (OTP step)
  - **Action:** Enter wrong OTP code
  - **Expected:** Error shown ("Invalid code" or similar); not proceeding to agent creation
  - **Verify:** `#otp-error` visible; still on Step 2

- [ ] **URL:** `https://www.sellingdubai.com/join` (OTP step)
  - **Action:** Enter correct OTP
  - **Expected:** Agent created; Step 3 (success screen) shown with profile URL
  - **Verify:** `#step-3` visible; profile link is `/a/[slug]` (not a Supabase storage URL, not `/#hero-waitlist`)

### Step 3: Success

- [ ] **URL:** `https://www.sellingdubai.com/join` (Step 3)
  - **Action:** Click the profile link on the success screen
  - **Expected:** Navigates to `/a/[slug]`; agent profile page loads
  - **Verify:** Profile page shows agent name + DLD badge; no 404

---

## Journey 2 — Agent Dashboard (`/dashboard.html`)

### Authentication

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html` (no token in localStorage)
  - **Action:** Open URL without logging in
  - **Expected:** Redirect to login or access-denied state; dashboard content not shown
  - **Verify:** Dashboard data does not load; `sd_edit_token` absent from localStorage

### Onboarding Checklist

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html` (logged in as a fresh agent)
  - **Action:** Open dashboard for a newly created agent (no tagline, no photo, no listing)
  - **Expected:** Onboarding checklist visible; "Add a bio/tagline" step shows incomplete
  - **Verify:** Tagline step is unchecked; step reads from `tagline` column (not `bio`)

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html`
  - **Action:** Navigate to profile edit, add a tagline (>10 chars), save, return to dashboard
  - **Expected:** Tagline step now shows as complete in the onboarding checklist
  - **Verify:** Checklist item checked; overall completion % increases

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html`
  - **Action:** Upload a profile photo
  - **Expected:** Photo step in checklist completes; photo displayed via Netlify Image CDN URL
  - **Verify:** Image `src` contains `/.netlify/images?url=` — no raw `supabase.co/storage` URL

### Leads

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html`
  - **Action:** View the Leads section (after a lead has been submitted via an agent profile page)
  - **Expected:** Lead appears with buyer name, phone/WhatsApp, and listing reference
  - **Verify:** Lead data matches what was submitted in Journey 3 below

---

## Journey 3 — Buyer Journey (`/[slug]`)

### Profile Page

- [ ] **URL:** `https://www.sellingdubai.com/[slug]` (use a real agent slug)
  - **Action:** Open the page
  - **Expected:** Agent name, photo, DLD badge, tagline, and listings all load; no broken images
  - **Verify:** Agent photo uses `/.netlify/images?url=...&fm=webp` URL; OG tags have agent photo (not raw Supabase URL)

- [ ] **URL:** `https://www.sellingdubai.com/[slug]`
  - **Action:** Check the "Get Your Page" nav button and any referral CTA
  - **Expected:** Both link to `/join` — not `/#hero-waitlist` and not any waitlist anchor
  - **Verify:** `href` of `#nav-claim-btn` is `/join`; referral CTA `href` is `/join`

### Lead Submission

- [ ] **URL:** `https://www.sellingdubai.com/[slug]`
  - **Action:** Click a listing → fill in buyer name, phone, message → submit lead form
  - **Expected:** Success confirmation shown; lead delivered (appears in agent's dashboard + WhatsApp if configured)
  - **Verify:** Success state visible in UI; lead row created in Supabase `leads` table

- [ ] **URL:** `https://www.sellingdubai.com/[slug]`
  - **Action:** Click "Mortgage Calculator" / any mortgage trigger
  - **Expected:** Mortgage modal opens; no infinite spinner or JS error in console
  - **Verify:** Console shows no `[mortgage] failed to load` error; modal opens on first and subsequent clicks

---

## Journey 4 — Mobile Experience (390px viewport)

Set browser to 390×844 (iPhone 14 equivalent) before running these checks.

- [ ] **URL:** `https://www.sellingdubai.com/join` at 390px
  - **Action:** Complete full Step 1 → Step 2 flow
  - **Expected:** No horizontal scroll; inputs are tappable (min 44px touch target); OTP field readable
  - **Verify:** `document.body.scrollWidth === window.innerWidth` (no overflow); form submits correctly

- [ ] **URL:** `https://www.sellingdubai.com/[slug]` at 390px
  - **Action:** Scroll through full agent profile
  - **Expected:** Photos, listing cards, and CTAs all render within viewport; no text overflow
  - **Verify:** Lead form visible and submittable without horizontal scroll

- [ ] **URL:** `https://www.sellingdubai.com/dashboard.html` at 390px
  - **Action:** Open dashboard, view checklist and leads
  - **Expected:** Checklist items stack vertically; tables or cards legible
  - **Verify:** No content clipped by overflow:hidden

---

## Journey 5 — Billing (`/pricing.html`)

### Gate Check (pre-launch)

- [ ] **URL:** `https://www.sellingdubai.com/pricing.html`
  - **Action:** Click any "Get Started" / upgrade button while `BILLING_LIVE = false`
  - **Expected:** Button briefly shows "Billing coming soon" then resets; no redirect to Stripe
  - **Verify:** No network request to `create-checkout` edge function; no Stripe URL opened

- [ ] **URL:** `https://www.sellingdubai.com/pricing.html`
  - **Action:** Inspect page source
  - **Expected:** `<meta name="robots" content="noindex, nofollow">` is present
  - **Verify:** Page does not appear in Google Search results (longer-term)

### Duplicate Subscription Guard (requires `BILLING_LIVE = true`)

- [ ] **URL:** `https://www.sellingdubai.com/pricing.html` (logged-in agent already on `pro`)
  - **Action:** Click "Upgrade to Pro" again
  - **Expected:** Button shows "Already on this plan"; no second checkout session created
  - **Verify:** `create-checkout` edge function returns 409 with `{"error":"already_on_plan"}`; no Stripe redirect

### Post-Payment (requires `BILLING_LIVE = true` and Stripe test mode)

- [ ] After completing Stripe test checkout:
  - **Action:** Return to `dashboard.html?billing=success`
  - **Expected:** Dashboard shows updated tier (pro or premium); billing status "active"
  - **Verify:** `agents.tier` column in Supabase matches purchased plan; `stripe_subscription_status = 'active'`

---

## Pre-Deploy Sign-off

All boxes above must be checked. Sign off by pasting this block in your deploy PR / commit message:

```
QA: all 5 journeys passed
Date: YYYY-MM-DD
Tester: [name]
Branch: [branch]
BILLING_LIVE: false | true (intentional)
```
