-- CreateTable
CREATE TABLE "departure_settlement_histories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "trigger_payment_schedule_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_status" "departure_status" NOT NULL,
    "new_status" "departure_status" NOT NULL,
    "operated_by" TEXT NOT NULL,
    "operated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_settlement_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_settlement_histories_departure_id_operated_at_idx" ON "departure_settlement_histories"("departure_id", "operated_at");

-- CreateIndex
CREATE INDEX "departure_settlement_histories_organization_id_departure_id_idx" ON "departure_settlement_histories"("organization_id", "departure_id");

-- AddForeignKey
ALTER TABLE "departure_settlement_histories" ADD CONSTRAINT "departure_settlement_histories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_settlement_histories" ADD CONSTRAINT "departure_settlement_histories_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_settlement_histories" ADD CONSTRAINT "departure_settlement_histories_trigger_payment_schedule_id_fkey" FOREIGN KEY ("trigger_payment_schedule_id") REFERENCES "payment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_settlement_histories" ADD CONSTRAINT "departure_settlement_histories_operated_by_fkey" FOREIGN KEY ("operated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
