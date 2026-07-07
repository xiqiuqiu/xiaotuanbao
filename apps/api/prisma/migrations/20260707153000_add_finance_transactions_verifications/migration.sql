-- CreateEnum
CREATE TYPE "transaction_direction" AS ENUM ('inflow', 'outflow');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('normal', 'cancelled');

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "transaction_no" TEXT NOT NULL,
    "direction" "transaction_direction" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "counterparty_type" "counterparty_type" NOT NULL,
    "counterparty_id" TEXT,
    "counterparty_name" TEXT,
    "departure_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_verifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "verification_no" TEXT NOT NULL,
    "payment_schedule_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "verification_status" NOT NULL DEFAULT 'normal',
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_transactions_organization_id_departure_id_idx" ON "finance_transactions"("organization_id", "departure_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_organization_id_transaction_no_key" ON "finance_transactions"("organization_id", "transaction_no");

-- CreateIndex
CREATE INDEX "finance_verifications_payment_schedule_id_status_idx" ON "finance_verifications"("payment_schedule_id", "status");

-- CreateIndex
CREATE INDEX "finance_verifications_transaction_id_status_idx" ON "finance_verifications"("transaction_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_verifications_organization_id_verification_no_key" ON "finance_verifications"("organization_id", "verification_no");

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_verifications" ADD CONSTRAINT "finance_verifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_verifications" ADD CONSTRAINT "finance_verifications_payment_schedule_id_fkey" FOREIGN KEY ("payment_schedule_id") REFERENCES "payment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_verifications" ADD CONSTRAINT "finance_verifications_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "finance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
