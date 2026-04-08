# SellingDubai v2.0 — Agent Automation Platform

**Date:** 2026-04-08
**Status:** Approved for planning
**Milestone:** v2.0

---

## What We're Building

An AI-powered automation layer for Dubai real estate agents. Every workflow an agent currently opens the dashboard to perform — checking leads, updating listings, responding to cobrokes, reviewing stats — becomes accessible hands-free via voice, WhatsApp, Telegram, or a native Siri shortcut. The web dashboard remains unchanged; this milestone wraps it with channels agents already live in.

**Core bet:** Dubai agents are mobile-first, WhatsApp-native, and time-poor. The agent who can run their business by speaking to their phone while driving to a viewing wins.

---

## Scope

### In scope
- Agent onboarding overhaul + retention nudge system
- Agency team analytics with benchmarks + cobroke discovery
- WhatsApp AI secretary (text + voice notes)
- Telegram bot with interactive lead cards + Mini App dashboard
- Siri Shortcuts integration (iOS, one-tap install)
- Voice phone call secretary via Vapi + Voxtral TTS
- Unified AI brain (Claude) with tool access to existing edge functions

### Out of scope (v2.0)
- Revenue / billing / Stripe activation (v2.1)
- Buyer accounts or saved search (separate milestone)
- Native iOS app with App Intents (v3 — Siri Shortcuts achieves 90% without it)
- Android native app (Shortcuts covers MVP; native app is v3)
- New listing portals or syndication
- New property data sources

---

## Architecture

### The AI Brain

A single Claude-powered orchestrator with tool definitions. Every channel (WhatsApp, Telegram, voice, Siri) resolves to the same pipeline:

```
User input (text / voice transcript)
        ↓
Agent identity resolved (phone → agent record)
        ↓
Claude (Haiku for speed, Sonnet for complex) + tool calls
        ↓
Existing edge functions execute (manage-properties, get-analytics, etc.)
        ↓
Response formatted for channel (spoken text / message / card)
```

**New edge function:** `ai-secretary` — stateless orchestrator. Receives `{ agent_id, message, channel }`, runs Claude with tools, returns `{ reply, actions_taken[] }`.

**Conversation state:** `whatsapp_sessions` and `telegram_sessions` tables in Supabase. Stores last 10 message turns per agent for context. TTL: 24 hours.

### Tool Definitions (wrapping existing functions)

| Tool | Edge function | What it does |
|------|--------------|--------------|
| `get_leads` | `get-analytics` | Returns today's / this week's leads |
| `update_lead` | `update-lead-status` | Mark contacted, archive, note |
| `get_listings` | `manage-properties` | List agent's active properties |
| `update_listing` | `manage-properties` | Price change, status, description |
| `get_cobrokes` | `cobroke-listings` | Open cobroke requests |
| `get_stats` | `agency-stats` / `weekly-stats` | Performance summary |
| `get_brief` | Composed | Morning summary: leads + actions + stats |

No new database tables for the tool layer — existing edge functions handle all mutations.

---

## Phase 1 — Agent Onboarding + Nudges

**Goal:** Reduce drop-off from join → active verified agent. Keep agents engaged after signup.

### Onboarding overhaul

- **Step persistence:** Save progress to localStorage at each step. "Continue where you left off" on return visit.
- **Copy clarity:** Replace "Is This You?" DLD lookup heading with "Verify your RERA licence". Subtext explains why.
- **Inline validation:** Real-time feedback on BRN format before submission. Avoid the "wrong format, start over" dead end.
- **Fix bio/tagline mismatch:** `join.html` saves to `bio`; `dashboard.html` reads `tagline`. Align to `bio` across both. (Known bug from v1.0.)

### Profile completeness score

- Score 0–100 calculated from: photo, bio, at least 1 listing, WhatsApp verified, RERA verified.
- Shown as a progress bar on dashboard home.
- Tooltip on each incomplete item: "Add a headshot → get 3× more profile views" (copy drives action).

### WhatsApp nudge sequence (edge function: `lead-nudger` extended)

- **Day 1 after signup:** "Welcome to SellingDubai. Add your first listing: [link]"
- **Day 3, profile < 60%:** "Your profile is 60% complete. Agents with photos get 3× more leads: [link]"
- **Day 7, no listing:** "Add a property listing to start receiving enquiries: [link]"
- **Weekly (ongoing):** "You have {N} leads this week. {M} need follow-up: [link]"
- **Lead idle > 5 days:** "Hassan Al Rashid hasn't heard from you in 5 days: [link]"

Nudges sent via existing WhatsApp OTP infrastructure (Twilio / WhatsApp Business). No new channel setup needed.

---

## Phase 2 — Agency Team Analytics + Cobroke Discovery

**Goal:** Give agency heads actionable performance data. Make cobroke a discovery feature, not just a request flow.

### Team analytics dashboard

New page: `/agency-dashboard.html` (or extend existing agency dashboard)

**Per-agent metrics:**
- Leads received / contacted / converted this month
- Response time (median hours to first contact)
- Active listings count
- Cobroke requests sent / received

**Team benchmarks:**
- Each metric shown as agent value vs team average
- "Top performer" badge on best metric per category
- Sortable table: agency head can rank by response time, conversion, listings

**Edge function changes:** `agency-stats` extended to accept `breakdown=agents` param. Returns per-agent rows. One new query, no schema change.

### Cobroke discovery

New surface on agent dashboard: "Browse Cobroke Listings"

- Filter by: area, property type, price range, listing age
- Each card shows: listing thumbnail, area, price, requesting agent name + agency
- One-tap request: sends `cobroke-request` to the listing agent
- "My open cobrokes" tab: status tracking for sent requests

**Edge function:** `cobroke-listings` already exists. Extend to support filter params. Add a new `cobroke-discover` function for browsing listings not yet requested.

### Agent invitation flow

- Agency head taps "Invite Agent" in agency dashboard
- System generates a unique join link with `agency_id` pre-embedded: `/join?agency=<token>`
- Agent signs up via normal flow; `agency_id` pre-filled, auto-associated on verification
- Agency head sees pending invite status

---

## Phase 3 — WhatsApp + Telegram AI Secretary (Text)

**Goal:** Agent manages leads, listings, and stats entirely from their phone's messaging apps. No dashboard login needed for routine tasks.

### WhatsApp

Extend `whatsapp-ingest`:

1. Receive inbound message (text or voice note)
2. If voice note: download audio URL → Whisper transcription → text
3. Resolve agent from phone number → `agents` table
4. If unrecognised number: onboarding prompt
5. Call `ai-secretary` with transcript + agent context
6. Reply with response text

**Interactive lead notifications:** When `capture-lead-v4` fires, also send WhatsApp message to assigned agent:
```
New lead: Hassan Al Rashid
2BR in JBR, budget AED 2M
📞 +971 50 XXX XXXX

[✓ Mark contacted] [📋 View] [✗ Archive]
```
Buttons via WhatsApp list messages (Business API).

### Telegram

New bot: `@SellingDubaiBot` (or white-labelled per agency)

- **BotFather setup:** Commands registered: `/leads`, `/listings`, `/stats`, `/brief`, `/help`
- **Lead cards:** Identical to WhatsApp but with inline keyboard buttons (Telegram's are richer — multi-row, callback query)
- **Voice notes:** Same Whisper pipeline as WhatsApp
- **Agent auth:** First `/start` → sends magic link to agent's email → session token stored in `telegram_sessions`

**New edge function:** `telegram-webhook` — receives Telegram Bot API updates, routes to `ai-secretary`.

### Telegram Mini App

Existing `dashboard.html` wrapped as a Telegram Mini App:

- Agent taps "Open Dashboard" button in bot → full dashboard opens inside Telegram
- Auth via `initData` from Telegram (cryptographically signed, mapped to agent session)
- No separate login required
- Same HTML/JS as web dashboard — zero duplication

**What this requires:** One new auth path in `verify-magic-link` (or new function `verify-telegram-init`) that validates Telegram's `initData` HMAC and issues a session token.

---

## Phase 4 — Voice Layer (Vapi + Voxtral)

**Goal:** Agent calls a number and has a natural conversation with their AI secretary. Full Siri-style interaction over a phone call.

### Vapi.ai integration

- Provision a phone number via Vapi
- Configure Vapi with:
  - System prompt: agent context (name, agency, current leads count)
  - Tools: same tool definitions as Phase 3 (`get_leads`, `update_listing`, etc.)
  - TTS: Voxtral (test Arabic quality) or ElevenLabs fallback
  - STT: Whisper (via Vapi's built-in, handles Dubai accent mix)
- Vapi calls `ai-secretary` via webhook for tool execution

**Agent onboarding for voice:** Dashboard shows "Your secretary number: +971 XX XXX XXXX. Save it." One line of setup.

### Voice quality decision: Voxtral vs ElevenLabs

Test both on Arabic and English mixed input (common in Dubai: "I want to update the JBR listing, يعني the price"). Use whichever scores better in informal testing. Voxtral is recommended first — free tier, Arabic support, built for agents. ElevenLabs as fallback if naturalness is notably better.

### Siri Shortcuts (iOS)

A downloadable `.shortcut` file hosted on a Netlify static URL:

**Shortcut logic:**
1. Ask for dictation input ("What would you like to do?")
2. POST spoken text + stored agent token to `ai-secretary` edge function
3. Speak response via iOS TTS (or Voxtral audio response)

**Agent onboarding:** Dashboard shows "Add Siri Shortcut" button → downloads `.shortcut` → agent sets trigger phrase → done.

**Advanced:** Parameterless shortcut with "Hey Siri, SellingDubai" always-on trigger. iOS 18 Siri handles routing to the Shortcut without unlocking phone.

### Android (Google Assistant)

Same pattern via Google Assistant Routines + HTTP action. Lower priority — Shortcuts achieves the primary use case. Document setup steps in agent help docs.

---

## Data Model Changes

| Table | Change | Reason |
|-------|--------|--------|
| `whatsapp_sessions` | New: `agent_id`, `turns[]`, `last_active` | Conversation context for AI |
| `telegram_sessions` | New: `agent_id`, `telegram_user_id`, `session_token`, `last_active` | Telegram auth + conversation state |
| `agent_invites` | New: `agency_id`, `token`, `used_at`, `invited_email` | Agency invitation flow |
| `agents` | Add: `profile_score` (computed), `siri_token` | Completeness score + Siri auth |
| `cobroke_listings` | No change — query extended | Cobroke discovery filter |
| `agency_stats` | No change — query extended | Per-agent breakdown param |

Migration count: 2 new tables + 2 column additions. All additive, no breaking changes.

---

## New Edge Functions

| Function | Purpose | Phase |
|----------|---------|-------|
| `ai-secretary` | Claude orchestrator, tool caller, channel-agnostic | 3 |
| `telegram-webhook` | Telegram Bot API update handler | 3 |
| `verify-telegram-init` | Validate Telegram initData HMAC → session | 3 |
| `cobroke-discover` | Browse cobroke listings with filters | 2 |

Existing functions modified (not replaced): `whatsapp-ingest`, `agency-stats`, `cobroke-listings`, `lead-followup-nagger`, `capture-lead-v4`.

---

## Tech Stack Additions

| Tool | Purpose | Cost model |
|------|---------|------------|
| Claude API (Haiku / Sonnet) | AI brain for secretary | Per token — Haiku for routine, Sonnet for complex |
| Vapi.ai | Real-time voice call handling | Per minute |
| Voxtral TTS (Mistral) | Voice synthesis | $0.016/1k chars or self-hosted |
| Whisper (OpenAI) | Speech-to-text for voice notes + calls | Per second of audio |
| Telegram Bot API | Bot + Mini App | Free |
| iOS Shortcuts | Siri integration | Free (Apple native) |

No new frontend frameworks. No new bundler config. All AI calls happen in edge functions — zero client-side AI.

---

## Security Considerations

- **Siri token:** Separate short-lived token (not the main session token). Rotatable from dashboard. Scoped to read + limited write (no billing, no account changes).
- **Telegram initData:** Validated server-side via HMAC-SHA256 against bot secret. Never trusted client-side.
- **WhatsApp:** Phone number verified against `agents` table. Unrecognised numbers get onboarding prompt, not data access.
- **Vapi webhooks:** Signed requests validated via Vapi secret header.
- **Voice data:** Audio not stored. Transcripts stored only in session turns table with 24h TTL.
- **Rate limiting:** `ai-secretary` inherits the existing `RATE_LIMIT_SALT` pattern from `send-magic-link`.

---

## Performance Constraints (from CLAUDE.md)

- No AI calls on page load — all secretary interactions are async, agent-initiated
- `init.bundle.js` stays under 30KB — no AI SDK added to frontend bundle
- Telegram Mini App uses existing `dashboard.html` — no new bundle entry point
- Siri Shortcut is a static `.shortcut` file — no JS

---

## Success Criteria

**Phase 1:**
- Agent drop-off at DLD verification step reduced (measurable via funnel in analytics)
- Profile completeness score visible on dashboard for all agents
- Nudge sequence firing correctly for new signups (testable via `log-event`)

**Phase 2:**
- Agency head can see per-agent lead response time and conversion
- Agent can browse and request cobroke listings without leaving the dashboard
- New agent joins with agency pre-associated via invite link

**Phase 3:**
- Agent can text "check my leads" to WhatsApp bot and get correct response
- Lead notification arrives on WhatsApp/Telegram within 30s of capture
- Telegram Mini App opens dashboard inside Telegram, authenticated
- Voice note processed and responded to within 10 seconds

**Phase 4:**
- Agent calls secretary number, hears greeting, can ask for leads and update a listing in one call
- Siri Shortcut downloadable from dashboard, works on first try
- Voxtral or ElevenLabs voice quality acceptable on Arabic/English mixed input

---

## Build Order & Dependencies

```
Phase 1 (onboarding)     — no dependencies, ship first
        ↓
Phase 2 (analytics)      — no dependencies, can parallel with Phase 1
        ↓
Phase 3 (WhatsApp + Telegram text) — needs ai-secretary edge function
        ↓
Phase 4 (voice + Siri)   — needs ai-secretary + Phase 3 pipeline proven
```

Phases 1 and 2 can be executed in parallel. Phase 3 blocks Phase 4.

---

*Spec written: 2026-04-08. Approved for implementation planning.*
