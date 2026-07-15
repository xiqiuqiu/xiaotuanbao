ALTER TYPE "payment_schedule_activity_type" ADD VALUE 'void';

ALTER TABLE "payment_schedules"
ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "voided_by" TEXT,
ADD COLUMN "void_reason" TEXT,
ADD COLUMN "voided_amount_cents" INTEGER;

ALTER TABLE "payment_schedules"
ADD CONSTRAINT "payment_schedules_voided_by_fkey"
FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "payment_schedules_organization_id_direction_source_type_source_id_key";

CREATE UNIQUE INDEX "payment_schedules_active_source_key"
ON "payment_schedules"("organization_id", "direction", "source_type", "source_id")
WHERE "voided_at" IS NULL;
