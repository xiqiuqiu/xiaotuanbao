-- CreateEnum
CREATE TYPE "source_order_discount_type" AS ENUM ('none', 'lump_sum');

-- CreateEnum
CREATE TYPE "source_order_collection_mode" AS ENUM ('guest_only', 'split', 'partner_settled');

-- CreateEnum
CREATE TYPE "guest_gender" AS ENUM ('male', 'female', 'unknown');

-- CreateTable
CREATE TABLE "source_orders" (
    "id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "gross_receivable_cents" INTEGER NOT NULL,
    "discount_type" "source_order_discount_type" NOT NULL DEFAULT 'none',
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_notes" TEXT,
    "net_receivable_cents" INTEGER NOT NULL,
    "collection_mode" "source_order_collection_mode" NOT NULL,
    "partner_collected_cents" INTEGER NOT NULL,
    "guest_collect_cents" INTEGER NOT NULL,
    "settlement_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_order_guests" (
    "id" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "gender" "guest_gender" NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_order_guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_orders_departure_id_partner_id_idx" ON "source_orders"("departure_id", "partner_id");

-- AddForeignKey
ALTER TABLE "source_orders" ADD CONSTRAINT "source_orders_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_orders" ADD CONSTRAINT "source_orders_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_order_guests" ADD CONSTRAINT "source_order_guests_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "source_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
