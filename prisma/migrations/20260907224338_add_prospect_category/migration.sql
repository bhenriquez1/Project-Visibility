-- CreateEnum
CREATE TYPE "ProspectCategory" AS ENUM ('PRODUCTION', 'INTERNAL', 'QA_TEST');

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "category" "ProspectCategory" NOT NULL DEFAULT 'PRODUCTION';
