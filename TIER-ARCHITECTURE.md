# SellingDubai — Tier Architecture

**Last updated: 2026-04-03**
**Status: Billing live. Stripe fully integrated. Gating enforced.**

---

## Current Live Pricing

| Tier | Monthly | Annual |
|------|---------|--------|
| Free | AED 0 | — |
| Pro | AED 299/month | AED 2,990/year |
| Premium | AED 799/month | AED 7,990/year |

---

## Tier Feature Matrix

### FREE — "Get Started"
- DLD-verified agent profile page
- WhatsApp lead button
- Lead capture form
- Up to 3 property listings
- Basic analytics (views, taps)
- Social links
- "Powered by SellingDubai" badge
- Email lead notifications

### PRO — AED 299/month
Everything in Free, plus:
- Up to 20 property listings
- Advanced analytics (source attribution, conversion rate)
- Lead CRM with pipeline management
- Remove SellingDubai branding
- Custom background image
- Facebook Pixel & GA4 integration
- Calendly consultation integration
- Priority support
- Weekly performance email

### PREMIUM — AED 799/month
Everything in Pro, plus:
- Unlimited property listings
- Lead export to CSV
- Featured agent badge
- Co-brokerage network *(in development)*
- Property matching engine *(in development)*
- Webhook/CRM integration *(in development)*
- Dedicated account manager *(in development)*

---

## Technical Implementation

### Database
```sql
-- tier column: 'free' | 'pro' | 'premium'
-- subscription_status: 'active' | 'past_due' | 'canceled' | null
ALTER TABLE agents ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE agents ADD COLUMN subscription_status TEXT;
ALTER TABLE agents ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE agents ADD COLUMN stripe_subscription_id TEXT;
```

### Feature Gating (frontend)
```javascript
// isPaidTier() in utils.js — includes 7-day grace on past_due
const isPro = agent.tier === 'pro' || agent.tier === 'premium';
const isPremium = agent.tier === 'premium';
```

### Billing Flow
```
Agent clicks "Upgrade" on /pricing →
POST /functions/v1/create-checkout (token, plan, interval) →
Stripe Checkout Session created →
Agent pays →
Stripe fires checkout.session.completed webhook →
/functions/v1/stripe-webhook → agents.tier updated →
Features unlocked
```

### Key edge functions
- `create-checkout` — creates Stripe Checkout session
- `stripe-webhook` — handles checkout, subscription updates, cancellation
- `create-portal-session` — Stripe Customer Portal for self-service billing

---

## Revenue Projections (current pricing)

| Scenario | Pro agents | Premium agents | MRR |
|----------|-----------|---------------|-----|
| Early | 10 | 2 | AED 4,590 |
| Growth | 50 | 10 | AED 22,940 |
| Scale | 200 | 40 | AED 91,760 |
