"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage } from "@/lib/cost";
import { decryptSecret } from "@/lib/crypto";
import { listReviews, postReviewReply } from "@/lib/providers/googleBusinessProfile";
import { answerGrowthManagerQuestion, generateReviewReplyDraft } from "@/lib/providers/llm";
import { createBillingPortalSession } from "@/lib/providers/stripe";
import {
  assertAgentCostBudget,
  assertMonthlyAiEntitlement,
  assertMonthlyEventEntitlement,
} from "@/lib/entitlements";
import { assertAutomationNotPaused } from "@/lib/automationPause";

async function requireCustomer(): Promise<string> {
  const session = await auth();
  // An impersonating admin (role "admin") never has session.user.prospectId set — that's only
  // populated for real customer logins — so this naturally rejects every write while
  // impersonating. The distinct message just makes the reason clear rather than implying the
  // admin isn't logged in at all.
  if (session?.user?.role === "admin") {
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

  const reviews = await listReviews(decryptSecret(connection.encryptedRefreshToken));
  if (!reviews.ok) {
    throw new Error(`Couldn't sync reviews: ${reviews.reason} — ${reviews.detail}`);
  }

  for (const review of reviews.data) {
    await prisma.reviewReply.upsert({
      where: { prospectId_googleReviewId: { prospectId, googleReviewId: review.resourceName } },
      update: {
        reviewerName: review.reviewerName,
        reviewRating: review.starRating,
        reviewComment: review.comment,
        reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
      },
      create: {
        prospectId,
        googleReviewId: review.resourceName,
        reviewerName: review.reviewerName,
        reviewRating: review.starRating,
        reviewComment: review.comment,
        reviewCreatedAt: review.createTime ? new Date(review.createTime) : null,
        draftReply: "",
        status: "DRAFT",
        aiGenerated: false,
      },
    });
  }

  await logEvent("reviews_synced", { prospectId, payload: { count: reviews.data.length } });
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

  const draft = await generateReviewReplyDraft({
    businessName: prospect.businessName,
    reviewerName: reviewReply.reviewerName,
    starRating: reviewReply.reviewRating,
    reviewComment: reviewReply.reviewComment,
  });

  if (!draft.ok) {
    throw new Error(`Couldn't generate a draft: ${draft.reason} — ${draft.detail}`);
  }

  await logAiUsage("ReviewReply", prospectId, draft.data.meta);

  await prisma.reviewReply.update({
    where: { id: reviewReplyId },
    data: { draftReply: draft.data.reply, status: "PENDING_CUSTOMER_APPROVAL", aiGenerated: true },
  });

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
