-- CreateEnum
CREATE TYPE "document_sequence_type" AS ENUM ('departure', 'ar', 'ap', 'tx', 'cl');

-- AlterTable: add business_prefix (nullable first for backfill)
ALTER TABLE "organizations" ADD COLUMN "business_prefix" TEXT;

-- Backfill demo org and assign unique prefixes to any remaining orgs
UPDATE "organizations"
SET "business_prefix" = 'XTB'
WHERE "business_prefix" IS NULL AND "name" = '演示旅行社';

UPDATE "organizations"
SET "business_prefix" = UPPER(SUBSTRING(REPLACE("id", 'c', 'X'), 1, 4))
WHERE "business_prefix" IS NULL;

-- Ensure NOT NULL and uniqueness
ALTER TABLE "organizations" ALTER COLUMN "business_prefix" SET NOT NULL;
CREATE UNIQUE INDEX "organizations_business_prefix_key" ON "organizations"("business_prefix");

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "document_type" "document_sequence_type" NOT NULL,
    "period_key" TEXT NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_organization_id_document_type_period_key_key" ON "document_sequences"("organization_id", "document_type", "period_key");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
