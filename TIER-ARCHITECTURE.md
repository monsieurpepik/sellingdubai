# SellingDubai — Premium Tier Architecture

## CURRENT STATE: Everything is free
The `tier` column defaults to `'free'` for all agents. No gates are enforced yet.
When you have 20-50 active agents and see which features they actually use, flip on gating.

---

## Tier Structure (Ready to Activate)

### FREE — "Get Started"
- Verified DLD profile page
- WhatsApp button
- Lead capture form (no Calendly)
- Email notifications (leads)
- 1 custom link
- Social links (all platforms)
- Basic SEO (auto-generated og:tags)

### PRO — AED 149/month (~$40)
Everything in Free, plus:
- Calendly consultation integration
- Facebook Pixel + Conversion API (server-side)
- Google Analytics GA4
- CRM webhook integration (Zapier, Make, HubSpot)
- 2 custom links
- Agency logo badge
- Background image customization
- Follow-up nagger emails (30-min reminders)
- Custom backhalf URL (choose your slug)
- Priority in agent directory (future)

### ENTERPRISE — AED 499/month (~$135)
Everything in Pro, plus:
- Multiple agent profiles under one brokerage
- Brokerage-wide lead dashboard
- Brokerage-level analytics
- White-label option (remove SellingDubai branding)
- API access for custom integrations
- Dedicated webhook with retry logic
- Team lead routing (round-robin assignment)

---

## Implementation (when ready)

### Database
The `tier` column is already added: `ALTER TABLE agents ADD COLUMN tier TEXT DEFAULT 'free'`

### Feature Gating in Edge Functions
```typescript
// In capture-lead — gate FB CAPI on pro tier
if (agent.facebook_pixel_id && agent.facebook_capi_token && agent.tier !== 'free') {
  // Fire FB CAPI event
}
```

### Feature Gating in Frontend (index.html)
```javascript
// Gate Calendly on pro tier
if (agent.calendly_url && agent.tier !== 'free') {
  // Show Calendly button
} else {
  // Show lead form button
}
```

### Stripe Integration (when ready)
1. Create Stripe products + prices for PRO and ENTERPRISE
2. Build `/billing` page with Stripe Checkout
3. Edge function `create-checkout-session` → Stripe Checkout
4. Stripe webhook → update agent `tier` column on payment
5. Stripe Customer Portal for self-service billing management

### Stripe Webhook Flow
```
Agent clicks "Upgrade to Pro" →
Stripe Checkout Session created →
Agent pays →
Stripe fires `checkout.session.completed` webhook →
Edge function updates agents.tier = 'pro' →
Features unlocked instantly
```

### Revenue Projections
- 50 agents × 30% conversion to Pro = 15 × AED 149 = AED 2,235/month
- 100 agents × 30% conversion = 30 × AED 149 = AED 4,470/month
- 500 agents × 25% conversion = 125 × AED 149 = AED 18,625/month
- Enterprise: 5 brokerages × AED 499 = AED 2,495/month

---

## DO NOT BUILD UNTIL:
1. You have 20+ active agents sharing their profiles
2. You've received organic leads through the platform
3. At least 3 agents have asked about a feature that's gated
4. You know your activation rate (% of signups who share their link)

The tier column is in the database. The gate checks are 2 lines of code.
Building Stripe checkout before you have paying intent is wasting weeks.
