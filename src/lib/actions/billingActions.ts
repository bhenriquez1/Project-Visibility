"use server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, getStripeClientForWebhook } from "@/lib/providers/stripe";
import { getPricingCatalog } from "@/lib/pricingCatalog";
import { randomUUID } from "node:crypto";

export async function ownerTestBilling(form: FormData) {
  const session = await auth();
  if (session?.user?.role !== "owner" || !session.user.email) throw new Error("Owner authentication required.");
  const prospectId = String(form.get("prospectId") ?? "");
  const planId = String(form.get("planId") ?? "");
  const action = String(form.get("action") ?? "checkout");
  const addonIds = form.getAll("addonId").map(String);
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (!prospect.email) throw new Error("Add the customer's real email first.");
  const existing = await prisma.subscription.findFirst({ where: { prospectId, status: { in: ["ACTIVE", "PAST_DUE", "INCOMPLETE"] } }, orderBy: { createdAt: "desc" } });
  if (action === "checkout") {
    if (existing) throw new Error("This customer already has a subscription. Use change or cancel instead.");
    const result = await createCheckoutSession({ prospectId, email: prospect.email, planId, addonIds });
    if (!result.ok) throw new Error(result.detail);
    return { message: "Test checkout created. No production charge was made.", url: result.data.url };
  }
  const client = getStripeClientForWebhook();
  if (!client || !existing?.stripeSubscriptionId) throw new Error("No configured subscription to change.");
  const subscription = await client.subscriptions.retrieve(existing.stripeSubscriptionId);
  if (subscription.livemode || process.env.STRIPE_LIVE_MODE === "true") throw new Error("Production billing changes are locked pending Brian's final approval.");
  if (action === "cancel") {
    await client.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  } else if (action === "change") {
    const catalog = await getPricingCatalog();
    const plan = catalog.plans.find(p => p.id === planId);
    const addons = addonIds.map(id => catalog.addons.find(a => a.id === id));
    if (!plan || !plan.availableForSale || !plan.stripeMonthlyPriceId || addons.some(a => !a?.availableForSale || !a.stripeMonthlyPriceId)) throw new Error("Select approved plans and add-ons with Stripe test prices.");
    if (new Set(addonIds).size !== addonIds.length) throw new Error("Duplicate add-on selection.");
    const items = [plan, ...addons.map(a => a!)];
    for (const item of items) {
      const price = await client.prices.retrieve(item.stripeMonthlyPriceId!);
      if (price.livemode || !price.active || price.currency !== "usd" || price.unit_amount !== item.monthlyPriceCents || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new Error("Stripe price does not match the approved test catalog.");
    }
    const allowances = { ...plan.allowances };
    for (const addon of addons) for (const [key, value] of Object.entries(addon!.allowances)) allowances[key] = (allowances[key] ?? 0) + value;
    const key = `catalog_snapshot_${randomUUID()}`;
    await prisma.setting.create({ data: { key, value: JSON.stringify({ ...plan, allowances, features: [...new Set(items.flatMap(i => i.features))], monthlyPriceCents: items.reduce((sum, i) => sum + i.monthlyPriceCents, 0), addonIds }) } });
    await client.subscriptions.update(subscription.id, {
      items: [...subscription.items.data.map(i => ({ id: i.id, deleted: true as const })), ...items.map(i => ({ price: i.stripeMonthlyPriceId!, quantity: 1 }))],
      proration_behavior: "none", payment_behavior: "error_if_incomplete", metadata: { ...subscription.metadata, planId: key },
    });
  } else throw new Error("Unsupported billing action.");
  await prisma.event.create({ data: { type: "owner_test_billing_changed", prospectId, payload: { action, planId, addonIds, owner: session.user.email, subscriptionId: subscription.id } } });
  return { message: action === "cancel" ? "Test subscription will cancel at period end." : "Test subscription updated without proration; the new amount applies at renewal. Webhooks will update customer access.", url: "" };
}
