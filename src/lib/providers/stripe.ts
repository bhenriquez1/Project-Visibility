import Stripe from "stripe";
import { type PlanId } from "@/lib/plans";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";
import { getPricingCatalog } from "@/lib/pricingCatalog";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { customerOfferSchema } from "@/lib/customerOffers";

function getClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function createCheckoutSession(input: {
  prospectId: string;
  email: string;
  planId?: PlanId;
  addonIds?: string[];
}): Promise<ProviderResult<{ url: string }>> {
  const client = getClient();
  const catalog = await getPricingCatalog();
  const planId = !input.planId || input.planId === "founding" ? "visibility" : input.planId;
  const offerRow = await prisma.setting.findUnique({ where: { key: `customer_offer_${input.prospectId}` } });
  const offer = offerRow ? customerOfferSchema.parse(JSON.parse(offerRow.value)) : null;
  const plan = offer && !offer.revoked && offer.plan.id === planId ? offer.plan : catalog.plans.find(p => p.id === planId);
  if (!plan?.availableForSale) return requestFailed("This plan is awaiting Brian's pricing and service approval.");
  const priceId = plan.stripeMonthlyPriceId;
  const appUrl = process.env.NEXTAUTH_URL;
  const expectedLiveMode = process.env.STRIPE_LIVE_MODE === "true";
  if (expectedLiveMode || process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    return requestFailed("Paid production billing is locked pending final pricing approval and release.");
  }

  if (!client) return notConfigured("STRIPE_SECRET_KEY is not set.");
  if (!priceId) return notConfigured("Configure the plan's Stripe test price in Owner Pricing.");
  if (!appUrl) return notConfigured("NEXTAUTH_URL is not set.");

  try {
    const addons = (input.addonIds ?? []).map(id => catalog.addons.find(a => a.id === id));
    if (addons.some(a => !a?.availableForSale || !a.stripeMonthlyPriceId) || new Set(input.addonIds).size !== (input.addonIds ?? []).length) return requestFailed("Select unique, approved add-ons with configured test prices.");
    for (const addon of addons) {
      const addonPrice = await client.prices.retrieve(addon!.stripeMonthlyPriceId!);
      if (!addonPrice.active || addonPrice.livemode || addonPrice.currency !== "usd" || addonPrice.unit_amount !== addon!.monthlyPriceCents || addonPrice.recurring?.interval !== "month" || addonPrice.recurring.interval_count !== 1) return requestFailed("An add-on Stripe price does not match the approved catalog.");
    }
    const price = await client.prices.retrieve(priceId);
    if (
      !price.active ||
      price.livemode !== expectedLiveMode ||
      price.unit_amount !== plan.monthlyPriceCents ||
      price.currency !== "usd" ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1
    ) {
      return requestFailed(
        `The configured Stripe price does not match the approved $${plan.monthlyPriceCents / 100}/month ${plan.name} price.`
      );
    }

    const snapshotKey = `catalog_snapshot_${randomUUID()}`;
    const allowances = { ...plan.allowances };
    for (const addon of addons) for (const [key, value] of Object.entries(addon!.allowances)) allowances[key] = (allowances[key] ?? 0) + value;
    await prisma.setting.create({ data: { key: snapshotKey, value: JSON.stringify({ ...plan, allowances, monthlyPriceCents: plan.monthlyPriceCents + addons.reduce((sum, a) => sum + a!.monthlyPriceCents, 0), features: [...new Set([...plan.features, ...addons.flatMap(a => a!.features)])] }) } });
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: catalog.promotionsEnabled,
      customer_email: input.email,
      line_items: [{ price: priceId, quantity: 1 }, ...addons.map(a => ({ price: a!.stripeMonthlyPriceId!, quantity: 1 }))],
      success_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=success`,
      cancel_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=cancelled`,
      metadata: { prospectId: input.prospectId, planId: snapshotKey },
      subscription_data: { metadata: { prospectId: input.prospectId, planId: snapshotKey } },
    });

    if (!session.url) return requestFailed("Stripe did not return a checkout URL.");
    return ok({ url: session.url });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Stripe request failed.");
  }
}

export async function createBillingPortalSession(input: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<ProviderResult<{ url: string }>> {
  const client = getClient();
  if (!client) return notConfigured("STRIPE_SECRET_KEY is not set.");

  try {
    const session = await client.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    });
    return ok({ url: session.url });
  } catch (err) {
    return requestFailed(err instanceof Error ? err.message : "Stripe request failed.");
  }
}

export function getStripeClientForWebhook(): Stripe | null {
  return getClient();
}
