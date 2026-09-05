import Stripe from "stripe";
import { notConfigured, ok, requestFailed, type ProviderResult } from "./types";

function getClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function createCheckoutSession(input: {
  prospectId: string;
  email: string;
}): Promise<ProviderResult<{ url: string }>> {
  const client = getClient();
  const priceId = process.env.STRIPE_PRICE_ID_FOUNDING;
  const appUrl = process.env.NEXTAUTH_URL;

  if (!client) return notConfigured("STRIPE_SECRET_KEY is not set.");
  if (!priceId) return notConfigured("STRIPE_PRICE_ID_FOUNDING is not set.");
  if (!appUrl) return notConfigured("NEXTAUTH_URL is not set.");

  try {
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=success`,
      cancel_url: `${appUrl}/admin/prospects/${input.prospectId}?checkout=cancelled`,
      metadata: { prospectId: input.prospectId },
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
