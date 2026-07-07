-- CreateEnum
CREATE TYPE "payment_schedule_direction" AS ENUM ('receivable', 'payable');

-- CreateEnum
CREATE TYPE "counterparty_type" AS ENUM ('partner', 'supplier', 'guest', 'manual');

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "direction" "payment_schedule_direction" NOT NULL,
    "schedule_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "counterparty_type" "counterparty_type" NOT NULL,
    "counterparty_id" TEXT,
    "counterparty_name" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "amount_adjusted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_schedules_organization_id_schedule_no_key" ON "payment_schedules"("organization_id", "schedule_no");

-- CreateIndex
CREATE INDEX "payment_schedules_organization_id_departure_id_idx" ON "payment_schedules"("organization_id", "departure_id");

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
