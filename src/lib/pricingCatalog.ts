import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLANS, type PlanDefinition } from "@/lib/plans";

const amount = z.number().int().min(0).max(100_000_000);
export const catalogItemSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
  name: z.string().trim().min(1).max(100),
  monthlyPriceCents: amount,
  annualPriceCents: amount.nullable(),
  stripeMonthlyPriceId: z.string().regex(/^price_/).nullable(),
  stripeAnnualPriceId: z.string().regex(/^price_/).nullable(),
  availableForSale: z.boolean(),
  features: z.array(z.string().trim().min(1).max(200)).max(60),
  allowances: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), amount),
}).strict();
export const catalogSchema = z.object({
  revision: z.number().int().positive(),
  plans: z.array(catalogItemSchema).min(1).max(30),
  addons: z.array(catalogItemSchema).max(30),
  foundingOffer: z.object({ enabled: z.boolean(), qualifyingCustomerLimit: z.number().int().min(0).max(25), monthlyPriceCents: amount, continuousSubscriptionRequired: z.literal(true) }).strict(),
  promotionsEnabled: z.boolean(),
}).strict().superRefine((catalog, ctx) => {
  const ids = [...catalog.plans, ...catalog.addons].map(item => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Plan and add-on IDs must be unique." });
});
export type PricingCatalog = z.infer<typeof catalogSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export const CATALOG_KEY = "pricing_catalog_v1";

export const catalogSnapshotSchema = catalogItemSchema.extend({
  addonIds: z.array(z.string()).default([]),
}).strict();

const visibility = ["Google/local visibility monitoring", "Local opportunity analysis", "GBP optimization recommendations", "Competitor monitoring", "Review monitoring", "AI-assisted review replies", "Monthly performance report", "AI Growth Manager", "Customer dashboard"];
const growth = [...visibility, "Lead Follow-Up Automation", "Review Request Automation", "Enhanced conversion tracking", "Automated follow-up sequences", "Appointment/lead tracking", "Enhanced competitor intelligence", "More frequent reporting"];
const revenue = [...growth, "Missed-Call Text-Back", "AI lead qualification", "AI booking workflows", "Estimate/Quote Follow-Up", "Customer Re-engagement", "Advanced CRM workflows", "Revenue recovery dashboard", "Attribution reporting", "Advanced automation"];
const base = { ...PLANS.founding.entitlements, smsSegmentsPerMonth: 0, callMinutesPerMonth: 0, aiConversationsPerMonth: 20 };
// Bootstrap values are persisted once. Runtime consumers always read the database catalog.
export function initialCatalog(): PricingCatalog {
  const item = (id: string, name: string, price: number, features: string[], locations = 1): CatalogItem => ({
    id, name, monthlyPriceCents: price, annualPriceCents: null,
    stripeMonthlyPriceId: null, stripeAnnualPriceId: null, availableForSale: false, features,
    allowances: Object.fromEntries(Object.entries({ ...base, locations }).filter(([, value]) => typeof value === "number")) as Record<string, number>,
  });
  return {
    revision: 1,
    plans: [item("visibility", "Visibility", 15000, visibility), item("growth", "Growth", 39900, growth), item("revenue_ai", "Revenue AI", 74900, revenue), item("revenue_ai_pro", "Revenue AI Pro", 149900, [...revenue, "Multiple locations", "Advanced CRM integrations", "Advanced reactivation campaigns", "Custom workflows", "Priority support", "Advanced analytics", "Cross-location reporting", "Additional AI automation capabilities"], 3)],
    addons: [["missed_call_ai", "Missed Call AI", 19900], ["lead_follow_up_ai", "Lead Follow-Up AI", 19900], ["review_automation", "Review Automation", 9900], ["estimate_follow_up", "Estimate Follow-Up", 14900], ["customer_reengagement", "Customer Re-engagement", 19900], ["additional_location", "Additional location", 10000]].map(([id, name, price]): CatalogItem => ({ ...item(String(id), String(name), Number(price), []), allowances: id === "additional_location" ? { locations: 1 } : {} })),
    foundingOffer: { enabled: false, qualifyingCustomerLimit: 25, monthlyPriceCents: 15000, continuousSubscriptionRequired: true },
    promotionsEnabled: false,
  };
}

export async function getPricingCatalog(): Promise<PricingCatalog> {
  const row = await prisma.setting.upsert({ where: { key: CATALOG_KEY }, update: {}, create: { key: CATALOG_KEY, value: JSON.stringify(initialCatalog()) } });
  return catalogSchema.parse(JSON.parse(row.value));
}

export async function resolveCatalogPlan(value: string): Promise<PlanDefinition | null> {
  if (value.startsWith("catalog_snapshot_")) {
    const snapshot = await prisma.setting.findUnique({ where: { key: value } });
    if (!snapshot) throw new Error("Subscription entitlement snapshot is missing.");
    const plan = catalogSnapshotSchema.parse(JSON.parse(snapshot.value));
    return { id: plan.id, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents, stripePriceEnvKey: "", addonIds: plan.addonIds, entitlements: { ...PLANS.founding.entitlements, ...plan.allowances, autonomousExternalActions: false } };
  }
  // Unversioned old subscriptions retain the original contract, including old Growth limits.
  if (["founding", "growth", "pro"].includes(value)) return null;
  const catalog = await getPricingCatalog();
  const plan = catalog.plans.find(p => p.id === value || p.stripeMonthlyPriceId === value || p.stripeAnnualPriceId === value);
  if (!plan) return null;
  return { id: plan.id, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents, stripePriceEnvKey: "", entitlements: { ...PLANS.founding.entitlements, ...plan.allowances, autonomousExternalActions: false } };
}
