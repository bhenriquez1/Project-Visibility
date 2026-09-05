-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('PROSPECT', 'AUDITED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ScoreLevel" AS ENUM ('NOT_AVAILABLE', 'NEEDS_ATTENTION', 'MODERATE', 'STRONG');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalTier" AS ENUM ('AUTOMATIC', 'AI_PREPARED', 'BRIAN_ONLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI');

-- CreateEnum
CREATE TYPE "DataApiProvider" AS ENUM ('GOOGLE_PLACES', 'SERP');

-- CreateEnum
CREATE TYPE "ReviewReplyStatus" AS ENUM ('DRAFT', 'PENDING_CUSTOMER_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'public_audit_form',
    "status" "ProspectStatus" NOT NULL DEFAULT 'PROSPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "rawWebsiteSignals" JSONB,
    "rawPlacesSignals" JSONB,
    "rawSerpSignals" JSONB,
    "visibilityScore" INTEGER,
    "profileScore" INTEGER,
    "reputationScore" INTEGER,
    "websiteSeoScore" INTEGER,
    "competitorGapScore" INTEGER,
    "conversionScore" INTEGER,
    "overallLevel" "ScoreLevel" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "narrative" TEXT,
    "unavailableSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalTier" "ApprovalTier" NOT NULL DEFAULT 'AI_PREPARED',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "model" TEXT NOT NULL,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costCents" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCallLog" (
    "id" TEXT NOT NULL,
    "provider" "DataApiProvider" NOT NULL,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "prospectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleBusinessConnection" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleBusinessConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReply" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "reviewRating" INTEGER,
    "reviewComment" TEXT,
    "reviewCreatedAt" TIMESTAMP(3),
    "draftReply" TEXT NOT NULL,
    "status" "ReviewReplyStatus" NOT NULL DEFAULT 'DRAFT',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_email_key" ON "Prospect"("email");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- CreateIndex
CREATE INDEX "Audit_prospectId_idx" ON "Audit"("prospectId");

-- CreateIndex
CREATE INDEX "Competitor_auditId_idx" ON "Competitor"("auditId");

-- CreateIndex
CREATE INDEX "Message_prospectId_idx" ON "Message"("prospectId");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_prospectId_idx" ON "Subscription"("prospectId");

-- CreateIndex
CREATE INDEX "AiUsage_relatedType_relatedId_idx" ON "AiUsage"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "ApiCallLog_relatedType_relatedId_idx" ON "ApiCallLog"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_prospectId_idx" ON "Event"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessConnection_prospectId_key" ON "GoogleBusinessConnection"("prospectId");

-- CreateIndex
CREATE INDEX "ReviewReply_prospectId_idx" ON "ReviewReply"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReply_prospectId_googleReviewId_key" ON "ReviewReply"("prospectId", "googleReviewId");

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessConnection" ADD CONSTRAINT "GoogleBusinessConnection_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
