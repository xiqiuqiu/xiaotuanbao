-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('group_join');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'on_sale', 'offline');

-- CreateEnum
CREATE TYPE "product_schedule_status" AS ENUM ('on_sale', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_type" "product_type" NOT NULL DEFAULT 'group_join',
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "short_itinerary" TEXT NOT NULL DEFAULT '',
    "detailed_itinerary" TEXT,
    "features_text" TEXT,
    "booking_notice" TEXT,
    "start_city" TEXT,
    "end_city" TEXT,
    "day_count" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '标准',
    "adult_price_cents" INTEGER,
    "child_price_cents" INTEGER,
    "single_room_supplement_cents" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_schedules" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_spec_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "date_rule_text" TEXT NOT NULL DEFAULT '',
    "start_date" DATE,
    "end_date" DATE,
    "status" "product_schedule_status" NOT NULL DEFAULT 'on_sale',
    "price_on_inquiry" BOOLEAN NOT NULL DEFAULT false,
    "adult_price_cents" INTEGER,
    "child_price_cents" INTEGER,
    "single_room_supplement_cents" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_status_updated_at_idx" ON "products"("organization_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "products_organization_id_name_idx" ON "products"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_product_id_name_key" ON "product_specs"("product_id", "name");

-- CreateIndex
CREATE INDEX "product_schedules_product_id_status_idx" ON "product_schedules"("product_id", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_product_spec_id_fkey" FOREIGN KEY ("product_spec_id") REFERENCES "product_specs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
