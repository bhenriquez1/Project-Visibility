export type PlanId = "founding" | "growth" | "pro";

export interface PlanEntitlements {
  locations: number;
  auditsPerMonth: number;
  reviewSyncsPerMonth: number;
  reviewDraftsPerMonth: number;
  growthQuestionsPerMonth: number;
  humanSupportMinutesPerMonth: number;
  includedAgentCostCentsPerMonth: number;
  autonomousExternalActions: false;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  stripePriceEnvKey: string;
  entitlements: PlanEntitlements;
}

/**
 * Commercial plans and hard service boundaries live in one registry. Growth and Pro are
 * deliberately defined now even though only Founding is sold initially, so adding their
 * Stripe price IDs later does not require changing checkout, webhooks, or entitlement logic.
 */
export const PLANS: Record<PlanId, PlanDefinition> = {
  founding: {
    id: "founding",
    name: "Founding",
    monthlyPriceCents: 15_000,
    stripePriceEnvKey: "STRIPE_PRICE_ID_FOUNDING",
    entitlements: {
      locations: 1,
      auditsPerMonth: 1,
      reviewSyncsPerMonth: 4,
      reviewDraftsPerMonth: 20,
      growthQuestionsPerMonth: 20,
      humanSupportMinutesPerMonth: 30,
      includedAgentCostCentsPerMonth: 2_500,
      autonomousExternalActions: false,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPriceCents: 29_900,
    stripePriceEnvKey: "STRIPE_PRICE_ID_GROWTH",
    entitlements: {
      locations: 3,
      auditsPerMonth: 2,
      reviewSyncsPerMonth: 12,
      reviewDraftsPerMonth: 75,
      growthQuestionsPerMonth: 60,
      humanSupportMinutesPerMonth: 60,
      includedAgentCostCentsPerMonth: 6_000,
      autonomousExternalActions: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceCents: 49_900,
    stripePriceEnvKey: "STRIPE_PRICE_ID_PRO",
    entitlements: {
      locations: 5,
      auditsPerMonth: 4,
      reviewSyncsPerMonth: 20,
      reviewDraftsPerMonth: 200,
      growthQuestionsPerMonth: 150,
      humanSupportMinutesPerMonth: 120,
      includedAgentCostCentsPerMonth: 15_000,
      autonomousExternalActions: false,
    },
  },
};

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

export function stripePriceIdForPlan(planId: PlanId): string | null {
  return process.env[PLANS[planId].stripePriceEnvKey] || null;
}

export function planIdForStripePrice(priceId: string): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (process.env[plan.stripePriceEnvKey] === priceId) return plan.id;
  }
  return null;
}

export function resolveStoredPlan(value: string): PlanDefinition | null {
  if (isPlanId(value)) return PLANS[value];
  const planId = planIdForStripePrice(value);
  return planId ? PLANS[planId] : null;
}
