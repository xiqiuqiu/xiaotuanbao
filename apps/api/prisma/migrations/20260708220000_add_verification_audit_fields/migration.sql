-- AlterTable
ALTER TABLE "finance_verifications" ADD COLUMN "verification_date" DATE,
ADD COLUMN "remark" TEXT,
ADD COLUMN "created_by" TEXT,
ADD COLUMN "cancelled_by" TEXT,
ADD COLUMN "cancel_reason" TEXT,
ADD COLUMN "bill_unsettled_after_cents" INTEGER;

UPDATE "finance_verifications"
SET
  "verification_date" = "created_at"::date,
  "created_by" = '',
  "bill_unsettled_after_cents" = 0
WHERE "verification_date" IS NULL;

ALTER TABLE "finance_verifications"
ALTER COLUMN "verification_date" SET NOT NULL,
ALTER COLUMN "created_by" SET NOT NULL,
ALTER COLUMN "bill_unsettled_after_cents" SET NOT NULL;
