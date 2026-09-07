import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { isNormalTransition } from "@/lib/pipelineTransitions";

const AUTO_REPLY_SUBJECT_PATTERNS = [/out of office/i, /automatic reply/i, /auto-?reply/i, /on vacation/i];

/**
 * Resend's email.received webhook payload is metadata only (from/to/subject/message_id — no
 * In-Reply-To/References). Real thread-matching needs the Receiving API's full headers, which
 * needs broader API-key permissions than a "send only" key has — the same limitation
 * verifySendingDomainReady() hits. This degrades honestly: if the richer fetch fails, it falls
 * back to matching by from-address against Prospect.email, which this app already treats as the
 * canonical, unique identifier for a prospect — a real fallback, not a guess.
 */
async function handleInboundEmail(apiKey: string, data: { email_id: string; from: string; subject: string }) {
  const resend = new Resend(apiKey);
  const fetched = await resend.emails.receiving.get(data.email_id);

  let headers: Record<string, string> | null = null;
  let body = "(No text content was available from the inbound email.)";

  if (!fetched.error && fetched.data) {
    headers = fetched.data.headers;
    body = fetched.data.text ?? fetched.data.html ?? body;
  } else {
    await logEvent("inbound_email_fetch_failed", {
      payload: { emailId: data.email_id, detail: fetched.error?.message ?? "Resend returned no data." },
    });
  }

  const autoSubmitted = headers?.["Auto-Submitted"] ?? headers?.["auto-submitted"];
  const looksAutomatic =
    (Boolean(autoSubmitted) && autoSubmitted!.toLowerCase() !== "no") ||
    AUTO_REPLY_SUBJECT_PATTERNS.some((pattern) => pattern.test(data.subject));
  if (looksAutomatic) {
    await logEvent("inbound_auto_reply_detected", { payload: { emailId: data.email_id, from: data.from, subject: data.subject } });
    return;
  }

  let prospectId: string | null = null;
  let matchMethod = "";

  if (headers) {
    const threadHeader = `${headers["In-Reply-To"] ?? headers["in-reply-to"] ?? ""} ${headers["References"] ?? headers["references"] ?? ""}`;
    const idMatch = threadHeader.match(/<([a-z0-9]+)@/i);
    if (idMatch) {
      const original = await prisma.message.findUnique({ where: { id: idMatch[1] } });
      if (original) {
        prospectId = original.prospectId;
        matchMethod = "message_id_threading";
      }
    }
  }
  if (!prospectId) {
    const prospect = await prisma.prospect.findUnique({ where: { email: data.from } });
    if (prospect) {
      prospectId = prospect.id;
      matchMethod = "from_address_fallback";
    }
  }
  if (!prospectId) {
    await logEvent("inbound_email_unmatched", { payload: { emailId: data.email_id, from: data.from } });
    return;
  }

  const existing = await prisma.message.findFirst({ where: { providerMessageId: data.email_id } });
  if (existing) return; // same physical email reported twice under different webhook deliveries

  const inbound = await prisma.message.create({
    data: { prospectId, direction: "INBOUND", status: "SENT", body, sentAt: new Date(), providerMessageId: data.email_id },
  });

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (isNormalTransition(prospect.status, "REPLIED")) {
    await prisma.prospect.update({ where: { id: prospectId }, data: { status: "REPLIED" } });
    await logEvent("status_changed", { prospectId, payload: { status: "REPLIED", from: prospect.status }, actorEmail: "system:resend_inbound" });
  }
  await logEvent("reply_received", { prospectId, payload: { messageId: inbound.id, matchMethod } });
}

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
      await handleInboundEmail(apiKey, event.data);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
