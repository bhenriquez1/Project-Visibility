import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClientForWebhook } from "@/lib/providers/stripe";
import { isPlanId, planIdForStripePrice } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";

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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const prospectId = session.metadata?.prospectId;
      if (!prospectId) break;

      const metadataPlanId = session.metadata?.planId;
      const planId = metadataPlanId && isPlanId(metadataPlanId) ? metadataPlanId : "founding";
      const priceCents = session.amount_total ?? 0;
      if (!session.customer || !session.subscription) break;

      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: String(session.subscription) },
        update: {
          plan: planId,
          priceCents,
          status: "ACTIVE",
          canceledAt: null,
        },
        create: {
          prospectId,
          stripeCustomerId: String(session.customer),
          stripeSubscriptionId: String(session.subscription),
          plan: planId,
          priceCents,
          status: "ACTIVE",
        },
      });

      await prisma.prospect.update({ where: { id: prospectId }, data: { status: "WON" } });
      await logEvent("subscription_created", { prospectId, payload: { sessionId: session.id } });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const item = sub.items.data[0];
      const priceId = item?.price.id;
      const metadataPlanId = sub.metadata?.planId;
      const planId =
        metadataPlanId && isPlanId(metadataPlanId)
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
            ? { priceCents: item.price.unit_amount }
            : {}),
          currentPeriodEnd: item?.current_period_end
            ? new Date(item.current_period_end * 1000)
            : existing.currentPeriodEnd,
          canceledAt: status === "CANCELED" ? new Date() : existing.canceledAt,
        },
      });

      if (status === "CANCELED") {
        await logEvent("subscription_canceled", { prospectId: existing.prospectId });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
