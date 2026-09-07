import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { catalogSchema, initialCatalog } from "./pricingCatalog";
import { monthlyRecurringCents } from "./billingMath";

describe("owner pricing contract", () => {
  it("starts with the requested prices and all sales disabled", () => {
    const catalog = catalogSchema.parse(initialCatalog());
    expect(catalog.plans.map(p => p.monthlyPriceCents)).toEqual([15000, 39900, 74900, 149900]);
    expect(catalog.addons.map(a => a.monthlyPriceCents)).toEqual([19900, 19900, 9900, 14900, 19900, 10000]);
    expect(catalog.plans.every(p => !p.availableForSale)).toBe(true);
    expect(catalog.plans.every(p => p.allowances.smsSegmentsPerMonth === 0 && p.allowances.callMinutesPerMonth === 0)).toBe(true);
  });
  it("rejects ambiguous plan identifiers, negative prices and unlimited usage", () => {
    const catalog = initialCatalog();
    catalog.plans.push(catalog.plans[0]);
    expect(catalogSchema.safeParse(catalog).success).toBe(false);
    const negative = initialCatalog(); negative.plans[0].monthlyPriceCents = -1;
    expect(catalogSchema.safeParse(negative).success).toBe(false);
    const unlimited = initialCatalog(); unlimited.plans[0].allowances.smsSegmentsPerMonth = Infinity;
    expect(catalogSchema.safeParse(unlimited).success).toBe(false);
  });
  it("normalizes annual recurring prices and counts all add-ons", () => {
    const item = (unit_amount: number, interval: string, quantity = 1) => ({ price: { unit_amount, currency: "usd", recurring: { interval, interval_count: 1 } }, quantity });
    expect(monthlyRecurringCents([item(180000, "year"), item(10000, "month", 2)])).toBe(35000);
    expect(() => monthlyRecurringCents([item(10000, "day")])).toThrow();
  });
  it("rejects variable charges as fixed MRR", () => {
    expect(() => monthlyRecurringCents([{ price: { unit_amount: null, currency: "usd", recurring: { interval: "month", interval_count: 1, usage_type: "metered" } } }])).toThrow();
  });
});
