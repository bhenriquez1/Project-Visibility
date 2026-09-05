import { afterEach, describe, expect, it } from "vitest";
import { PLANS, planIdForStripePrice, resolveStoredPlan } from "./plans";

describe("plans", () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_FOUNDING;
    delete process.env.STRIPE_PRICE_ID_GROWTH;
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  it("defines the initial and future recurring tiers without unbounded service", () => {
    expect(PLANS.founding.monthlyPriceCents).toBe(15_000);
    expect(PLANS.growth.monthlyPriceCents).toBe(29_900);
    expect(PLANS.pro.monthlyPriceCents).toBe(49_900);

    for (const plan of Object.values(PLANS)) {
      expect(plan.entitlements.autonomousExternalActions).toBe(false);
      for (const value of Object.values(plan.entitlements)) {
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("resolves both new plan IDs and legacy stored Stripe price IDs", () => {
    process.env.STRIPE_PRICE_ID_FOUNDING = "price_founding";
    expect(planIdForStripePrice("price_founding")).toBe("founding");
    expect(resolveStoredPlan("founding")?.id).toBe("founding");
    expect(resolveStoredPlan("price_founding")?.id).toBe("founding");
  });
});
