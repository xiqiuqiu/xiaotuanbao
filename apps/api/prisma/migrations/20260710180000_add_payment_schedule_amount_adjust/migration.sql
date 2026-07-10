-- AlterEnum
ALTER TYPE "payment_schedule_activity_type" ADD VALUE 'amount_adjust';

-- AlterTable
ALTER TABLE "payment_schedule_activities" ADD COLUMN "previous_amount_cents" INTEGER;
