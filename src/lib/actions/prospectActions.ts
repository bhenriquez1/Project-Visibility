"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { sendEmail } from "@/lib/providers/email";
import { generateOutreachDraft, generateReplyDraft } from "@/lib/providers/llm";
import { createCheckoutSession } from "@/lib/providers/stripe";
import { assertAutomationNotPaused } from "@/lib/automationPause";
import type { ProspectStatus } from "@/generated/prisma/client";

async function requireAdmin() {
  const session = await auth();
  // Route-level middleware (proxy.ts) already gates /admin/*, but server actions are a second
  // authorization boundary worth checking explicitly — a customer session also carries an
  // email, so checking presence alone would let a customer invoke admin-only mutations.
  if (!session?.user?.email || session.user.role !== "admin") {
    throw new Error("Not authenticated as an admin.");
  }
  return session.user.email;
}

export async function setProspectEmail(prospectId: string, email: string) {
  await requireAdmin();

  await prisma.prospect.update({ where: { id: prospectId }, data: { email } });
  await logEvent("email_added", { prospectId });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}

export async function updateProspectStatus(prospectId: string, status: ProspectStatus) {
  await requireAdmin();

  await prisma.prospect.update({ where: { id: prospectId }, data: { status } });
  await logEvent("status_changed", { prospectId, payload: { status } });

  revalidatePath("/admin/pipeline");
  revalidatePath(`/admin/prospects/${prospectId}`);
}

export async function generateOutreachDraftAction(prospectId: string) {
  await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: { audits: { orderBy: { requestedAt: "desc" }, take: 1 } },
  });

  if (!prospect.email) {
    throw new Error("This prospect has no email on file yet — add one before drafting outreach.");
  }

  const latestAudit = prospect.audits[0];
  const narrative = latestAudit?.narrative ?? "No completed audit narrative is available yet.";

  const draft = await generateOutreachDraft({
    businessName: prospect.businessName,
    contactEmail: prospect.email,
    auditNarrative: narrative,
  });

  if (!draft.ok) {
    throw new Error(`Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
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

export async function generateReplyDraftAction(prospectId: string) {
  await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    include: { messages: { orderBy: { createdAt: "asc" }, where: { status: "SENT" } } },
  });

  const draft = await generateReplyDraft({
    businessName: prospect.businessName,
    conversationSoFar: prospect.messages.map((m) => ({ direction: m.direction, body: m.body })),
  });

  if (!draft.ok) {
    throw new Error(`Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
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

  if (!message.prospect.email) {
    throw new Error("This prospect has no email on file — add one before sending.");
  }

  const body = editedBody ?? message.body;

  const sendResult = await sendEmail({
    to: message.prospect.email,
    subject: message.subject ?? `A note from Local Visibility AI`,
    html: body.replace(/\n/g, "<br />"),
  });

  if (!sendResult.ok) {
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
    },
  });

  if (message.prospect.status === "AUDITED") {
    await prisma.prospect.update({ where: { id: message.prospectId }, data: { status: "CONTACTED" } });
  }

  await logEvent("outreach_sent", { prospectId: message.prospectId, payload: { messageId } });
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
    throw new Error("This prospect has no email on file — add one before creating a checkout link.");
  }

  const checkout = await createCheckoutSession({ prospectId, email: prospect.email });
  if (!checkout.ok) {
    throw new Error(`Couldn't create a checkout link: ${checkout.reason} — ${checkout.detail}`);
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
  await requireAdmin();

  await prisma.message.create({
    data: { prospectId, direction: "INBOUND", status: "SENT", body, sentAt: new Date() },
  });

  await prisma.prospect.update({ where: { id: prospectId }, data: { status: "REPLIED" } });
  await logEvent("reply_logged", { prospectId });

  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}
