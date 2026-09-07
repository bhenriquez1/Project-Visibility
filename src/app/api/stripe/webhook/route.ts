import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClientForWebhook } from "@/lib/providers/stripe";
import { isPlanId, planIdForStripePrice } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { resolveCatalogPlan } from "@/lib/pricingCatalog";
import { monthlyRecurringCents } from "@/lib/billingMath";
import { customerOfferSchema } from "@/lib/customerOffers";

export async function POST(req: Request) {
  const client = getStripeClientForWebhook();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!client || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)." },
      { status: 501 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Missing stripe-signature header.");
    event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  // Stripe retries deliveries (and can occasionally send the same event twice even without a
  // retry). Claim the event id atomically via a unique-key create — a duplicate delivery loses
  // the race, catches the unique-constraint error, and returns success without re-running any
  // side effect (subscription writes are naturally idempotent, but Event-log rows below are not).
  try {
    await prisma.setting.create({
      data: { key: `stripe_event_${event.id}`, value: new Date().toISOString() },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const prospectId = session.metadata?.prospectId;
      if (!prospectId) break;

      const metadataPlanId = session.metadata?.planId;
      const planId = metadataPlanId && (isPlanId(metadataPlanId) || await resolveCatalogPlan(metadataPlanId)) ? metadataPlanId : null;
      if (!planId) return NextResponse.json({ error: "Unknown subscription plan" }, { status: 422 });
      if (!session.customer || !session.subscription) break;
      const liveSubscription = await client.subscriptions.retrieve(String(session.subscription));
      const priceCents = monthlyRecurringCents(liveSubscription.items.data);
      const status = liveSubscription.status === "active" ? "ACTIVE" : "INCOMPLETE";

      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: String(session.subscription) },
        update: {
          plan: planId,
          priceCents,
          status,
          canceledAt: null,
        },
        create: {
          prospectId,
          stripeCustomerId: String(session.customer),
          stripeSubscriptionId: String(session.subscription),
          plan: planId,
          priceCents,
          status,
        },
      });

      if (status === "ACTIVE") {
        await prisma.prospect.update({ where: { id: prospectId }, data: { status: "WON" } });
        await logEvent("status_changed", { prospectId, payload: { status: "WON" }, actorEmail: "system:stripe_webhook" });
      }
      await logEvent("subscription_created", { prospectId, payload: { sessionId: session.id }, actorEmail: "system:stripe_webhook" });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = await client.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
      const item = sub.items.data[0];
      const priceId = item?.price.id;
      const metadataPlanId = sub.metadata?.planId;
      const planId =
        metadataPlanId && (isPlanId(metadataPlanId) || await resolveCatalogPlan(metadataPlanId))
          ? metadataPlanId
          : priceId
            ? planIdForStripePrice(priceId)
            : null;
      const existing = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: sub.id },
      });
      if (!existing) break;

      const status =
        sub.status === "active"
          ? "ACTIVE"
          : sub.status === "past_due"
            ? "PAST_DUE"
            : sub.status === "canceled"
              ? "CANCELED"
              : "INCOMPLETE";

      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status,
          ...(planId ? { plan: planId } : {}),
          ...(item?.price.unit_amount !== null && item?.price.unit_amount !== undefined
            ? { priceCents: monthlyRecurringCents(sub.items.data) }
            : {}),
          currentPeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000)
            : existing.currentPeriodEnd,
          canceledAt: status === "CANCELED" ? new Date() : existing.canceledAt,
        },
      });

      if (status === "CANCELED") {
        const key = `customer_offer_${existing.prospectId}`;
        const row = await prisma.setting.findUnique({ where: { key } });
        if (row) {
          const offer = customerOfferSchema.parse(JSON.parse(row.value));
          if (offer.founding) await prisma.setting.update({ where: { key }, data: { value: JSON.stringify({ ...offer, revoked: true }) } });
        }
        await logEvent("subscription_canceled", { prospectId: existing.prospectId });
      }
      break;
    }

    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const reference = invoice.parent?.subscription_details?.subscription;
      if (!reference) break;
      const sub = await client.subscriptions.retrieve(typeof reference === "string" ? reference : reference.id);
      const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
      if (existing) {
        const status = sub.status === "active" ? "ACTIVE" : sub.status === "past_due" || sub.status === "unpaid" ? "PAST_DUE" : sub.status === "canceled" ? "CANCELED" : "INCOMPLETE";
        await prisma.subscription.update({ where: { id: existing.id }, data: { status } });
        await logEvent(event.type === "invoice.paid" ? "subscription_payment_received" : "subscription_payment_failed", { prospectId: existing.prospectId, payload: { invoiceId: invoice.id } });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
