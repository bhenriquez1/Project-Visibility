"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { decryptSecret } from "@/lib/crypto";
import { postReviewReply } from "@/lib/providers/googleBusinessProfile";
import { answerGrowthManagerQuestion } from "@/lib/providers/llm";
import { syncReviewsForProspect, draftReviewReply } from "@/lib/reviews/reviewSync";
import { createBillingPortalSession } from "@/lib/providers/stripe";
import { sendEmail } from "@/lib/providers/email";
import {
  assertAgentCostBudget,
  assertMonthlyAiEntitlement,
  assertMonthlyEventEntitlement,
} from "@/lib/entitlements";
import { assertAutomationNotPaused } from "@/lib/automationPause";

async function requireCustomer(): Promise<string> {
  const session = await auth();
  // An impersonating owner never has session.user.prospectId set — that's only
  // populated for real customer logins — so this naturally rejects every write while
  // impersonating. The distinct message just makes the reason clear rather than implying the
  // admin isn't logged in at all.
  if (session?.user?.role === "owner") {
    throw new Error("Read-only: you're viewing as a customer. Stop impersonating to make changes.");
  }
  if (!session?.user || session.user.role !== "customer" || !session.user.prospectId) {
    throw new Error("Not authenticated as a customer.");
  }
  return session.user.prospectId;
}

/** Ensures the current customer owns this ReviewReply before any read/write. */
async function requireOwnedReviewReply(reviewReplyId: string, prospectId: string) {
  const reviewReply = await prisma.reviewReply.findUniqueOrThrow({ where: { id: reviewReplyId } });
  if (reviewReply.prospectId !== prospectId) {
    throw new Error("This review does not belong to your account.");
  }
  return reviewReply;
}

/** Ensures the current customer owns this Estimate before any read/write. */
async function requireOwnedEstimate(estimateId: string, prospectId: string) {
  const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } });
  if (estimate.prospectId !== prospectId) {
    throw new Error("This estimate does not belong to your account.");
  }
  return estimate;
}

export async function syncReviewsAction() {
  const prospectId = await requireCustomer();
  await assertMonthlyEventEntitlement(
    prospectId,
    "reviewSyncsPerMonth",
    "reviews_synced",
    "review syncs"
  );
  await assertAgentCostBudget(prospectId);

  const connection = await prisma.googleBusinessConnection.findUnique({ where: { prospectId } });
  if (!connection) {
    throw new Error("Google Business Profile is not connected for this account.");
  }

  const { count } = await syncReviewsForProspect(prospectId, connection);

  await logEvent("reviews_synced", { prospectId, payload: { count } });
  revalidatePath("/portal/reviews");
}

export async function generateReviewReplyDraftAction(reviewReplyId: string) {
  const prospectId = await requireCustomer();
  await assertMonthlyAiEntitlement(
    prospectId,
    "reviewDraftsPerMonth",
    "ReviewReply",
    "review reply drafts"
  );
  await assertAgentCostBudget(prospectId);
  const reviewReply = await requireOwnedReviewReply(reviewReplyId, prospectId);
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });

  await draftReviewReply(reviewReply, prospect.businessName);

  revalidatePath("/portal/reviews");
}

export async function approveAndPostReviewReply(reviewReplyId: string, editedReply?: string) {
  const prospectId = await requireCustomer();
  await assertAutomationNotPaused(); // global pause stops outbound posts immediately too
  const reviewReply = await requireOwnedReviewReply(reviewReplyId, prospectId);

  const connection = await prisma.googleBusinessConnection.findUnique({ where: { prospectId } });
  if (!connection) throw new Error("Google Business Profile is not connected for this account.");

  const replyText = editedReply ?? reviewReply.draftReply;

  const result = await postReviewReply(
    decryptSecret(connection.encryptedRefreshToken),
    reviewReply.googleReviewId,
    replyText
  );

  if (!result.ok) {
    throw new Error(`Couldn't post the reply: ${result.reason} — ${result.detail}`);
  }

  await prisma.reviewReply.update({
    where: { id: reviewReplyId },
    data: { status: "POSTED", draftReply: replyText, approvedAt: new Date(), postedAt: new Date() },
  });

  await logEvent("review_reply_posted", { prospectId, payload: { reviewReplyId } });
  revalidatePath("/portal/reviews");
  revalidatePath("/portal");
}

export async function rejectReviewReply(reviewReplyId: string) {
  const prospectId = await requireCustomer();
  await requireOwnedReviewReply(reviewReplyId, prospectId);

  await prisma.reviewReply.update({
    where: { id: reviewReplyId },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });

  revalidatePath("/portal/reviews");
}

export async function askGrowthManagerAction(question: string): Promise<string> {
  const prospectId = await requireCustomer();
  await assertMonthlyAiEntitlement(
    prospectId,
    "growthQuestionsPerMonth",
    "GrowthManagerQuestion",
    "AI Growth Manager questions"
  );
  await assertAgentCostBudget(prospectId);

  const [prospect, latestAudit, reviews] = await Promise.all([
    prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } }),
    prisma.audit.findFirst({
      where: { prospectId, status: { in: ["COMPLETE", "PARTIAL"] } },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.reviewReply.findMany({ where: { prospectId }, take: 20 }),
  ]);

  const reviewSummary =
    reviews.length === 0
      ? "No reviews synced yet."
      : `${reviews.length} reviews on file, ${reviews.filter((r) => r.status !== "POSTED").length} without a posted reply, average rating ${(
          reviews.reduce((sum, r) => sum + (r.reviewRating ?? 0), 0) / reviews.length
        ).toFixed(1)}.`;

  const answer = await answerGrowthManagerQuestion({
    businessName: prospect.businessName,
    question,
    auditNarrative: latestAudit?.narrative ?? null,
    reviewSummary,
  });

  if (!answer.ok) {
    throw new Error(`Couldn't get an answer: ${answer.reason} — ${answer.detail}`);
  }

  await logAiUsage("GrowthManagerQuestion", prospectId, answer.data.meta);
  // Full content persisted (not just that a question happened) so the Owner Command Center's
  // Sales Inbox / AI Trace can show every AI conversation, not just that one occurred.
  await logEvent("growth_manager_question_asked", {
    prospectId,
    payload: { question, answer: answer.data.answer },
  });

  return answer.data.answer;
}

export async function setMyObjectives(businessObjectives: string) {
  const prospectId = await requireCustomer();

  await prisma.prospect.update({ where: { id: prospectId }, data: { businessObjectives } });
  await logEvent("objectives_recorded", { prospectId, payload: { source: "self_serve" } });

  revalidatePath("/portal");
}

export async function openBillingPortalAction() {
  const prospectId = await requireCustomer();

  const subscription = await prisma.subscription.findFirst({
    where: { prospectId, status: "ACTIVE" },
  });
  if (!subscription) throw new Error("No active subscription found for this account.");

  const appUrl = process.env.NEXTAUTH_URL ?? "";
  const portal = await createBillingPortalSession({
    stripeCustomerId: subscription.stripeCustomerId,
    returnUrl: `${appUrl}/portal/billing`,
  });

  if (!portal.ok) {
    throw new Error(`Couldn't open billing portal: ${portal.reason} — ${portal.detail}`);
  }

  redirect(portal.data.url);
}

export async function logEstimateAction(input: {
  customerName: string;
  customerEmail?: string;
  serviceDescription: string;
  amountCents: number;
}) {
  const prospectId = await requireCustomer();

  await prisma.estimate.create({
    data: {
      prospectId,
      customerName: input.customerName,
      customerEmail: input.customerEmail || null,
      serviceDescription: input.serviceDescription,
      amountCents: input.amountCents,
    },
  });
  await logEvent("estimate_logged", { prospectId, payload: { source: "self_serve" } });

  revalidatePath("/portal/estimates");
}

export async function markEstimateAcceptedAction(estimateId: string) {
  const prospectId = await requireCustomer();
  await requireOwnedEstimate(estimateId, prospectId);

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  revalidatePath("/portal/estimates");
}

export async function markEstimateDeclinedAction(estimateId: string) {
  const prospectId = await requireCustomer();
  await requireOwnedEstimate(estimateId, prospectId);

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "DECLINED", declinedAt: new Date() },
  });

  revalidatePath("/portal/estimates");
}

export async function approveAndSendEstimateFollowUp(estimateId: string, editedBody?: string) {
  const prospectId = await requireCustomer();
  await assertAutomationNotPaused(); // global pause stops outbound sends immediately too
  const estimate = await requireOwnedEstimate(estimateId, prospectId);

  if (estimate.status !== "FOLLOW_UP_DRAFTED") {
    throw new Error("This estimate doesn't have a follow-up draft ready to send.");
  }
  if (!estimate.customerEmail) {
    throw new Error("This estimate has no customer email on file — add one before sending.");
  }

  const body = editedBody ?? estimate.followUpBody ?? "";

  const result = await sendEmail({
    to: estimate.customerEmail,
    subject: estimate.followUpSubject ?? "Following up on your estimate",
    html: body.replace(/\n/g, "<br />"),
  });

  if (!result.ok) {
    throw new Error(`Couldn't send: ${result.reason} — ${result.detail}`);
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "FOLLOW_UP_SENT", followUpBody: body, followUpSentAt: new Date() },
  });

  await logEvent("estimate_follow_up_sent", { prospectId, payload: { estimateId } });
  revalidatePath("/portal/estimates");
}

export async function dismissEstimateFollowUp(estimateId: string) {
  const prospectId = await requireCustomer();
  await requireOwnedEstimate(estimateId, prospectId);

  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/portal/estimates");
}
