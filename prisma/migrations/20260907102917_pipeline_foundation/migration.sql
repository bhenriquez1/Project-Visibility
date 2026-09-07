-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "complainedAt" TIMESTAMP(3),
ADD COLUMN     "emailDiscoveredAt" TIMESTAMP(3),
ADD COLUMN     "emailSourceUrl" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "nextActionDueAt" TIMESTAMP(3),
ADD COLUMN     "nextActionLabel" TEXT,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedAddress" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "complainedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "evidenceUsed" JSONB,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "providerError" TEXT,
ADD COLUMN     "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "actorEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");

