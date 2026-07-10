-- CreateEnum
CREATE TYPE "payment_schedule_close_disposition" AS ENUM ('external_or_special', 'business_dispute_stop', 'other');

-- CreateEnum
CREATE TYPE "payment_schedule_activity_type" AS ENUM ('close', 'verification_cancelled');

-- AlterTable
ALTER TABLE "payment_schedules"
ADD COLUMN "cancelled_by" TEXT,
ADD COLUMN "close_disposition" "payment_schedule_close_disposition";

-- CreateTable
CREATE TABLE "payment_schedule_activities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payment_schedule_id" TEXT NOT NULL,
    "activity_type" "payment_schedule_activity_type" NOT NULL,
    "close_disposition" "payment_schedule_close_disposition",
    "note" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "settled_amount_cents" INTEGER,
    "unsettled_amount_cents" INTEGER,
    "previous_settled_amount_cents" INTEGER,
    "previous_unsettled_amount_cents" INTEGER,
    "verification_id" TEXT,
    "operated_by" TEXT NOT NULL,
    "operated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_schedule_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_schedule_activities_payment_schedule_id_operated_at_idx" ON "payment_schedule_activities"("payment_schedule_id", "operated_at");

-- CreateIndex
CREATE INDEX "payment_schedule_activities_organization_id_payment_schedule_id_idx" ON "payment_schedule_activities"("organization_id", "payment_schedule_id");

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_activities" ADD CONSTRAINT "payment_schedule_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_activities" ADD CONSTRAINT "payment_schedule_activities_payment_schedule_id_fkey" FOREIGN KEY ("payment_schedule_id") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_activities" ADD CONSTRAINT "payment_schedule_activities_operated_by_fkey" FOREIGN KEY ("operated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
