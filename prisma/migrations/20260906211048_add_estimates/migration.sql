-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('SENT', 'FOLLOW_UP_DRAFTED', 'FOLLOW_UP_SENT', 'DISMISSED', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EstimateStatus" NOT NULL DEFAULT 'SENT',
    "followUpSubject" TEXT,
    "followUpBody" TEXT,
    "followUpAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "followUpSentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Estimate_prospectId_idx" ON "Estimate"("prospectId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

