import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!apiKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Resend is not configured on this server (RESEND_API_KEY / RESEND_WEBHOOK_SECRET)." },
      { status: 501 }
    );
  }

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  const rawBody = await req.text();

  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    if (!id || !timestamp || !signature) throw new Error("Missing svix-id/svix-timestamp/svix-signature headers.");
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({ payload: rawBody, headers: { id, timestamp, signature }, webhookSecret });
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  // Same idempotency pattern as the Stripe webhook — claim the event id atomically via a
  // unique-key create; a duplicate delivery loses the race and returns success as a no-op.
  try {
    await prisma.setting.create({
      data: { key: `resend_event_${id}`, value: new Date().toISOString() },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "email.delivered": {
      await prisma.message.updateMany({
        where: { providerMessageId: event.data.email_id },
        data: { deliveredAt: new Date(event.created_at) },
      });
      break;
    }

    case "email.bounced": {
      const message = await prisma.message.findFirst({ where: { providerMessageId: event.data.email_id } });
      if (!message) break;
      await prisma.message.update({
        where: { id: message.id },
        data: { bouncedAt: new Date(event.created_at), providerError: event.data.bounce.message },
      });
      // Conservative by design: any bounce (soft or hard) suppresses future outreach to this
      // prospect rather than trying to distinguish bounce subtypes — re-sending to an address
      // that already bounced risks sender reputation regardless of the reason.
      await prisma.prospect.update({ where: { id: message.prospectId }, data: { unsubscribedAt: new Date() } });
      await logEvent("outreach_bounced", { prospectId: message.prospectId, payload: { messageId: message.id, reason: event.data.bounce.message } });
      break;
    }

    case "email.complained": {
      const message = await prisma.message.findFirst({ where: { providerMessageId: event.data.email_id } });
      if (!message) break;
      await prisma.message.update({ where: { id: message.id }, data: { complainedAt: new Date(event.created_at) } });
      await prisma.prospect.update({ where: { id: message.prospectId }, data: { complainedAt: new Date(event.created_at) } });
      await logEvent("outreach_complained", { prospectId: message.prospectId, payload: { messageId: message.id } });
      break;
    }

    case "email.failed": {
      await prisma.message.updateMany({
        where: { providerMessageId: event.data.email_id },
        data: { failedAt: new Date(event.created_at), providerError: event.data.failed.reason },
      });
      break;
    }

    case "email.received": {
      // TODO(Phase G): match to the right prospect/conversation and move CONTACTED -> REPLIED.
      // Needs Brian's decision first — inbound receiving requires either an MX record pointed at
      // Resend for a subdomain, or a Resend-managed resend.app address; neither is configured
      // yet. Logged, not dropped, so nothing is silently lost once that's set up.
      await logEvent("inbound_email_received_unhandled", { payload: { emailId: event.data.email_id, from: event.data.from } });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
