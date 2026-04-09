/**
 * Shared tier enforcement for SellingDubai edge functions.
 *
 * Usage:
 *   import { resolveEffectiveTier, TIER_LIMITS } from "../_shared/tier.ts";
 *
 *   const tier = resolveEffectiveTier(agent);
 *   const maxListings = TIER_LIMITS[tier].listings;
 */

export interface AgentTierFields {
  tier?: string;
  stripe_subscription_status?: string;
  stripe_current_period_end?: string;
  bonus_listings?: number;
}

/**
 * Resolve the effective tier, honouring the 7-day grace period on past_due.
 * If payment failed but we're still within period_end + 7 days, keep paid tier.
 * If canceled, downgrade to free immediately.
 */
export function resolveEffectiveTier(agent: AgentTierFields): string {
  const tier = agent.tier ?? "free";
  if (tier === "free") return "free";
  if (agent.stripe_subscription_status === "past_due" && agent.stripe_current_period_end) {
    const graceEnd = new Date(agent.stripe_current_period_end);
    graceEnd.setDate(graceEnd.getDate() + 7);
    if (new Date() > graceEnd) return "free";
  }
  if (agent.stripe_subscription_status === "canceled") return "free";
  return tier;
}

/** Per-tier feature limits. */
export const TIER_LIMITS: Record<string, { listings: number; leads_export: boolean; advanced_analytics: boolean }> = {
  free:    { listings: 3,        leads_export: false, advanced_analytics: false },
  pro:     { listings: 20,       leads_export: true,  advanced_analytics: true  },
  premium: { listings: Infinity, leads_export: true,  advanced_analytics: true  },
};

/**
 * Returns the effective listing limit for an agent, including bonus listings.
 */
export function getListingLimit(agent: AgentTierFields): number {
  const tier = resolveEffectiveTier(agent);
  const base = TIER_LIMITS[tier]?.listings ?? 3;
  const bonus = agent.bonus_listings ?? 0;
  return base + bonus;
}
