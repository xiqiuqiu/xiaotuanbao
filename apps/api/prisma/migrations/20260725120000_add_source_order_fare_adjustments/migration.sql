-- CreateEnum
CREATE TYPE "fare_adjustment_direction" AS ENUM ('increase', 'decrease');

-- CreateEnum
CREATE TYPE "fare_adjustment_kind" AS ENUM (
  'single_room_supplement',
  'child_ticket',
  'extended_stay',
  'student_ticket_pre_discounted',
  'child_half_ticket_pre_discounted',
  'senior_free_ticket_pre_discounted',
  'custom'
);

-- AlterTable
ALTER TABLE "source_orders" ADD COLUMN "fare_adjustment_net_cents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "source_order_fare_adjustments" (
    "id" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "kind" "fare_adjustment_kind" NOT NULL,
    "direction" "fare_adjustment_direction" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "custom_name" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_order_fare_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_order_fare_adjustments_source_order_id_idx" ON "source_order_fare_adjustments"("source_order_id");

-- AddForeignKey
ALTER TABLE "source_order_fare_adjustments" ADD CONSTRAINT "source_order_fare_adjustments_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "source_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
