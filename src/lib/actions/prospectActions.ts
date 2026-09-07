"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { sendEmail, verifySendingDomainReady } from "@/lib/providers/email";
import { generateOutreachDraft, generateReplyDraft, extractQualificationSignals } from "@/lib/providers/llm";
import { createCheckoutSession } from "@/lib/providers/stripe";
import { assertAutomationNotPaused } from "@/lib/automationPause";
import type { ProspectStatus } from "@/generated/prisma/client";
import { discoverPublicContactEmail } from "@/lib/providers/website";
import { isNormalTransition } from "@/lib/pipelineTransitions";
import { collectAuditFindings } from "@/lib/audit/findings";

/**
 * Redirects back to the prospect page with a readable error instead of letting an admin-facing
 * button's failure crash into Next's generic error boundary — the underlying reason (e.g.
 * NOT_CONFIGURED, "awaiting pricing approval") stays visible, matching this codebase's own "no
 * silent failure, surface it explicitly" standard.
 */
function redirectWithError(prospectId: string, message: string): never {
  redirect(`/admin/prospects/${prospectId}?error=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const session = await auth();
  // Route-level middleware (proxy.ts) already gates /admin/*, but server actions are a second
  // authorization boundary worth checking explicitly — a customer session also carries an
  // email, so checking presence alone would let a customer invoke admin-only mutations.
  if (!session?.user?.email || session.user.role !== "owner") {
    throw new Error("Not authenticated as the owner.");
  }
  return session.user.email;
}

export async function setProspectEmail(prospectId: string, email: string) {
  const actorEmail = await requireAdmin();

  const owner = await prisma.prospect.findUnique({ where: { email }, select: { id: true } });
  if (owner && owner.id !== prospectId) {
    redirectWithError(prospectId, "That email is already assigned to another prospect. Review the duplicate before adding it here.");
  }

  // Manual entry, not automated site-crawl discovery — leaves emailVerified at its false
  // default, and clears any stale source/discovery data a prior auto-discovery may have set.
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { email, emailVerified: false, emailSourceUrl: null, emailDiscoveredAt: null },
  });
  await logEvent("email_added", { prospectId, actorEmail });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}

/** Records what a customer told us their goals are (e.g. via a reply Brian read and logged) —
 * never inferred or guessed. See src/lib/agents/onboarding.ts for how this closes the loop. */
export async function setProspectObjectives(prospectId: string, businessObjectives: string) {
  await requireAdmin();

  await prisma.prospect.update({ where: { id: prospectId }, data: { businessObjectives } });
  await logEvent("objectives_recorded", { prospectId });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/customers");
}

export async function updateProspectStatus(prospectId: string, status: ProspectStatus) {
  const actorEmail = await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (!isNormalTransition(prospect.status, status)) {
    redirectWithError(
      prospectId,
      `${prospect.status} → ${status} isn't a normal pipeline transition. Use the override below with a reason if this is intentional.`
    );
  }

  await prisma.prospect.update({ where: { id: prospectId }, data: { status } });
  await logEvent("status_changed", { prospectId, payload: { status, from: prospect.status }, actorEmail });

  revalidatePath("/admin/pipeline");
  revalidatePath(`/admin/prospects/${prospectId}`);
}

/**
 * The audited escape hatch for a backward, skipped, or otherwise non-normal status change — a
 * reason is mandatory and every override is logged distinctly from a normal transition so it's
 * never confused with the pipeline's ordinary progression.
 */
export async function overrideProspectStatus(prospectId: string, status: ProspectStatus, reason: string) {
  const actorEmail = await requireAdmin();

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    redirectWithError(prospectId, "An override requires a reason.");
  }

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });

  await prisma.prospect.update({ where: { id: prospectId }, data: { status } });
  await logEvent("status_override_applied", {
    prospectId,
    payload: { from: prospect.status, to: status, reason: trimmedReason },
    actorEmail,
  });

  revalidatePath("/admin/pipeline");
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function generateOutreachDraftAction(prospectId: string) {
  await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: {
      audits: { orderBy: { requestedAt: "desc" }, take: 1 },
      messages: { where: { status: "PENDING_APPROVAL" }, take: 1 },
    },
  });

  if (prospect.messages.length > 0) {
    redirectWithError(prospectId, "There's already a draft pending approval for this prospect — review or reject it before generating another.");
  }

  let contactEmail = prospect.email;
  if (!contactEmail) {
    const discovered = await discoverPublicContactEmail(prospect.website);
    if (!discovered.ok) {
      redirectWithError(prospectId, "No public email was found on this business's website. Add a verified email before drafting outreach.");
    }
    const owner = await prisma.prospect.findUnique({ where: { email: discovered.data.email }, select: { id: true } });
    if (owner && owner.id !== prospectId) {
      redirectWithError(prospectId, "That public email is already assigned to another prospect. Review the duplicate before outreach.");
    }
    contactEmail = discovered.data.email;
    await prisma.prospect.update({
      where: { id: prospectId },
      data: {
        email: contactEmail,
        emailSourceUrl: discovered.data.sourceUrl,
        emailDiscoveredAt: new Date(),
        emailVerified: true,
      },
    });
    await logEvent("contact_email_discovered", {
      prospectId,
      payload: { sourceUrl: discovered.data.sourceUrl, method: "public_business_website" },
    });
  }

  const latestAudit = prospect.audits[0];
  const findings = latestAudit ? collectAuditFindings(latestAudit) : [];
  if (findings.length === 0) {
    redirectWithError(prospectId, "No concrete audit findings available yet to personalize outreach — run or complete an audit first.");
  }

  const draft = await generateOutreachDraft({
    businessName: prospect.businessName,
    contactEmail,
    findings,
  });

  if (!draft.ok) {
    redirectWithError(prospectId, `Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
  }

  await logAiUsage("Message", prospectId, draft.data.meta);

  await prisma.message.create({
    data: {
      prospectId,
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      approvalTier: "AI_PREPARED",
      subject: draft.data.subject,
      body: draft.data.body,
      aiGenerated: true,
      evidenceUsed: draft.data.evidenceUsed,
    },
  });

  await logEvent("outreach_drafted", { prospectId, payload: { evidenceUsed: draft.data.evidenceUsed } });
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function generateReplyDraftAction(prospectId: string) {
  await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: { messages: { orderBy: { createdAt: "asc" }, where: { status: { in: ["SENT", "PENDING_APPROVAL"] } } } },
  });

  const sentMessages = prospect.messages.filter((m) => m.status === "SENT");
  const hasRealInboundReply = sentMessages.some((m) => m.direction === "INBOUND");
  if (!hasRealInboundReply) {
    redirectWithError(prospectId, "There's no real inbound reply yet — this drafts a reply, not a follow-up to your own outreach.");
  }
  if (prospect.messages.some((m) => m.status === "PENDING_APPROVAL")) {
    redirectWithError(prospectId, "There's already a draft pending approval for this prospect — review or reject it before generating another.");
  }

  const draft = await generateReplyDraft({
    businessName: prospect.businessName,
    conversationSoFar: sentMessages.map((m) => ({ direction: m.direction, body: m.body })),
  });

  if (!draft.ok) {
    redirectWithError(prospectId, `Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
  }

  await logAiUsage("Message", prospectId, draft.data.meta);

  await prisma.message.create({
    data: {
      prospectId,
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      approvalTier: "AI_PREPARED",
      subject: draft.data.subject,
      body: draft.data.body,
      aiGenerated: true,
    },
  });

  await logEvent("outreach_drafted", { prospectId });
  revalidatePath(`/admin/prospects/${prospectId}`);
}

/** "Human takeover" — Brian composing a message himself, not starting from an AI draft. Reuses
 * the same PENDING_APPROVAL → approve-and-send path as every AI-drafted message; the only
 * difference is aiGenerated: false, so it's visible as human-authored in the Sales Inbox. */
export async function composeManualMessage(prospectId: string, subject: string, body: string) {
  await requireAdmin();

  await prisma.message.create({
    data: {
      prospectId,
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      approvalTier: "BRIAN_ONLY",
      subject,
      body,
      aiGenerated: false,
    },
  });

  await logEvent("outreach_composed_manually", { prospectId });
  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/inbox");
}

export async function approveAndSendMessage(messageId: string, editedBody?: string) {
  const approver = await requireAdmin();
  await assertAutomationNotPaused(); // global pause stops outbound sends immediately, not just future agent runs

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { prospect: true },
  });

  // A retried/double-clicked approval must never send twice — this is the whole message's
  // idempotency guard, checked before any provider call.
  if (message.status === "SENT") {
    redirectWithError(message.prospectId, "This message was already sent.");
  }

  if (!message.prospect.email) {
    throw new Error("This prospect has no email on file — add one before sending.");
  }

  if (message.prospect.unsubscribedAt) {
    redirectWithError(message.prospectId, "This prospect unsubscribed — outreach is suppressed.");
  }
  if (message.prospect.complainedAt) {
    redirectWithError(message.prospectId, "This prospect marked a prior message as spam — outreach is suppressed.");
  }

  const domainReady = await verifySendingDomainReady();
  if (!domainReady.ok) {
    redirectWithError(message.prospectId, `Sending is disabled: ${domainReady.reason} — ${domainReady.detail}`);
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const recipientDomain = message.prospect.email.split("@")[1] ?? "";

  const [dailyLimitSetting, domainLimitSetting, sentToday, sentTodayToDomain] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "outbound_daily_limit" } }),
    prisma.setting.findUnique({ where: { key: "outbound_per_domain_daily_limit" } }),
    prisma.message.count({ where: { status: "SENT", sentAt: { gte: todayStart } } }),
    prisma.message.count({
      where: { status: "SENT", sentAt: { gte: todayStart }, prospect: { email: { endsWith: `@${recipientDomain}` } } },
    }),
  ]);
  const dailyLimit = Number(dailyLimitSetting?.value ?? 0);
  const domainLimit = Number(domainLimitSetting?.value ?? 0);

  if (dailyLimit <= 0 || sentToday >= dailyLimit) {
    redirectWithError(message.prospectId, "Sending is disabled: no daily outbound limit is configured, or today's limit is reached.");
  }
  if (domainLimit <= 0 || sentTodayToDomain >= domainLimit) {
    redirectWithError(message.prospectId, `Sending is disabled: no per-domain daily limit is configured, or today's limit for @${recipientDomain} is reached.`);
  }

  const body = editedBody ?? message.body;
  const appUrl = process.env.NEXTAUTH_URL ?? "";

  const sendResult = await sendEmail({
    to: message.prospect.email,
    subject: message.subject ?? `A note from Local Visibility AI`,
    html: body.replace(/\n/g, "<br />"),
    idempotencyKey: message.id,
    unsubscribeUrl: `${appUrl}/unsubscribe/${message.prospectId}`,
    messageId: message.id,
  });

  if (!sendResult.ok) {
    await prisma.message.update({ where: { id: messageId }, data: { failedAt: new Date(), providerError: sendResult.detail } });
    throw new Error(`Couldn't send: ${sendResult.reason} — ${sendResult.detail}`);
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      status: "SENT",
      body,
      approvedBy: approver,
      approvedAt: new Date(),
      sentAt: new Date(),
      providerMessageId: sendResult.data.id,
      idempotencyKey: message.id,
    },
  });

  if (message.prospect.status === "AUDITED") {
    await prisma.prospect.update({ where: { id: message.prospectId }, data: { status: "CONTACTED" } });
  }

  await logEvent("outreach_sent", { prospectId: message.prospectId, payload: { messageId }, actorEmail: approver });
  revalidatePath(`/admin/prospects/${message.prospectId}`);
  revalidatePath("/admin/pipeline");
}

export async function rejectMessage(messageId: string) {
  await requireAdmin();

  const message = await prisma.message.update({
    where: { id: messageId },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });

  revalidatePath(`/admin/prospects/${message.prospectId}`);
}

export async function createCheckoutLinkAction(prospectId: string) {
  await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });

  if (!prospect.email) {
    redirectWithError(prospectId, "This prospect has no email on file — add one before creating a checkout link.");
  }

  const checkout = await createCheckoutSession({ prospectId, email: prospect.email });
  if (!checkout.ok) {
    redirectWithError(prospectId, `Couldn't create a checkout link: ${checkout.reason} — ${checkout.detail}`);
  }

  await prisma.message.create({
    data: {
      prospectId,
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      approvalTier: "AI_PREPARED",
      subject: "Get started with Local Visibility AI",
      body: `Hi — here's the secure link to start your subscription: ${checkout.data.url}`,
      aiGenerated: false,
    },
  });

  await prisma.prospect.update({ where: { id: prospectId }, data: { status: "PROPOSAL" } });
  await logEvent("checkout_link_created", { prospectId });
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function logInboundReply(prospectId: string, body: string) {
  const actorEmail = await requireAdmin();

  await prisma.message.create({
    data: { prospectId, direction: "INBOUND", status: "SENT", body, sentAt: new Date() },
  });

  await prisma.prospect.update({ where: { id: prospectId }, data: { status: "REPLIED" } });
  await logEvent("reply_logged", { prospectId, actorEmail });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}

/**
 * No auth — this is a public unsubscribe link sent inside outreach emails. Setting
 * unsubscribedAt is a strictly protective action from the recipient's side; the worst case of
 * abuse is a prospect getting suppressed from outreach they'd have received anyway.
 */
export async function confirmUnsubscribe(prospectId: string) {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) return;

  await prisma.prospect.update({ where: { id: prospectId }, data: { unsubscribedAt: new Date() } });
  await logEvent("unsubscribed", { prospectId, actorEmail: "recipient:self_service" });
}

/**
 * Purely informational — never touches Prospect.status. Brian reads the suggestions and decides
 * whether to move the prospect to QUALIFIED using the existing status controls.
 */
export async function extractQualificationSignalsAction(prospectId: string) {
  const actorEmail = await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: { messages: { orderBy: { createdAt: "asc" }, where: { status: "SENT" } } },
  });

  if (prospect.messages.length === 0) {
    redirectWithError(prospectId, "There's no conversation yet to extract qualification signals from.");
  }

  const result = await extractQualificationSignals({
    businessName: prospect.businessName,
    conversationSoFar: prospect.messages.map((m) => ({ direction: m.direction, body: m.body })),
  });

  if (!result.ok) {
    redirectWithError(prospectId, `Couldn't extract qualification signals: ${result.reason} — ${result.detail}`);
  }

  await logAiUsage("QualificationSignals", prospectId, result.data.meta);
  await logEvent("qualification_signals_extracted", { prospectId, payload: { signals: result.data.signals }, actorEmail });

  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function setNextAction(prospectId: string, label: string, dueAt: string) {
  const actorEmail = await requireAdmin();

  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      nextActionLabel: label.trim() || null,
      nextActionDueAt: dueAt ? new Date(dueAt) : null,
    },
  });
  await logEvent("next_action_set", { prospectId, payload: { label, dueAt }, actorEmail });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}
