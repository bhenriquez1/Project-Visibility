
-- CreateEnum
CREATE TYPE "ReviewReplyStatus" AS ENUM ('DRAFT', 'PENDING_CUSTOMER_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

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

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessConnection_prospectId_key" ON "GoogleBusinessConnection"("prospectId");

-- CreateIndex
CREATE INDEX "ReviewReply_prospectId_idx" ON "ReviewReply"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReply_prospectId_googleReviewId_key" ON "ReviewReply"("prospectId", "googleReviewId");

-- AddForeignKey
ALTER TABLE "GoogleBusinessConnection" ADD CONSTRAINT "GoogleBusinessConnection_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReply" ADD CONSTRAINT "ReviewReply_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

