import Stripe from "stripe";
import { PLANS, stripePriceIdForPlan, type PlanId } from "@/lib/plans";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

function getClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function createCheckoutSession(input: {
  prospectId: string;
  email: string;
  planId?: PlanId;
}): Promise<ProviderResult<{ url: string }>> {
  const client = getClient();
  const planId = input.planId ?? "founding";
  const plan = PLANS[planId];
  const priceId = stripePriceIdForPlan(planId);
  const appUrl = process.env.NEXTAUTH_URL;
  const expectedLiveMode = process.env.STRIPE_LIVE_MODE === "true";

  if (!client) return notConfigured("STRIPE_SECRET_KEY is not set.");
  if (!priceId) return notConfigured(`${plan.stripePriceEnvKey} is not set.`);
  if (!appUrl) return notConfigured("NEXTAUTH_URL is not set.");

  try {
    const price = await client.prices.retrieve(priceId);
    if (
      !price.active ||
      price.livemode !== expectedLiveMode ||
      price.unit_amount !== plan.monthlyPriceCents ||
      price.currency !== "usd" ||
      price.recurring?.interval !== "month"
    ) {
      return requestFailed(
        `${plan.stripePriceEnvKey} does not point to the active ${expectedLiveMode ? "live" : "test"}-mode $${plan.monthlyPriceCents / 100}/month ${plan.name} price.`
      );
    }

    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=success`,
      cancel_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=cancelled`,
      metadata: { prospectId: input.prospectId, planId },
      subscription_data: { metadata: { prospectId: input.prospectId, planId } },
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
