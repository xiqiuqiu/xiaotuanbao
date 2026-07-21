-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('group_tour');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'on_sale', 'off_shelf');

-- CreateEnum
CREATE TYPE "product_schedule_status" AS ENUM ('on_sale', 'closed', 'cancelled');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_type" "product_type" NOT NULL DEFAULT 'group_tour',
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "departure_city" TEXT,
    "arrival_city" TEXT,
    "day_count" INTEGER,
    "short_itinerary" TEXT,
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
    "single_supplement_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_schedules" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "source_spec_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "date_rule_text" TEXT,
    "date_range_start" DATE,
    "date_range_end" DATE,
    "adult_price_cents" INTEGER,
    "child_price_cents" INTEGER,
    "single_supplement_cents" INTEGER,
    "inquire_only" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "product_schedule_status" NOT NULL DEFAULT 'on_sale',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_status_idx" ON "products"("organization_id", "status");

-- CreateIndex
CREATE INDEX "products_organization_id_updated_at_idx" ON "products"("organization_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_product_id_name_key" ON "product_specs"("product_id", "name");

-- CreateIndex
CREATE INDEX "product_schedules_product_id_status_idx" ON "product_schedules"("product_id", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_source_spec_id_fkey" FOREIGN KEY ("source_spec_id") REFERENCES "product_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
