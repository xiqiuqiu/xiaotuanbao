-- CreateEnum
CREATE TYPE "resource_kind" AS ENUM ('transport', 'hotel', 'guide', 'ticket', 'meal', 'outsource', 'other');

-- CreateTable
CREATE TABLE "route_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_day_count" INTEGER NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_template_segments" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "day_count" INTEGER NOT NULL,
    "destination" TEXT,
    "notes" TEXT,

    CONSTRAINT "route_template_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_template_resources" (
    "id" TEXT NOT NULL,
    "template_segment_id" TEXT NOT NULL,
    "resource_kind" "resource_kind" NOT NULL,
    "counterparty_type" "counterparty_type" NOT NULL,
    "partner_id" TEXT,
    "supplier_id" TEXT,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "route_template_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_segments" (
    "id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "day_count" INTEGER NOT NULL,
    "destination" TEXT,
    "notes" TEXT,
    "applicable_guest_count" INTEGER NOT NULL DEFAULT 1,
    "from_template" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "itinerary_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_resources" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "resource_kind" "resource_kind" NOT NULL,
    "counterparty_type" "counterparty_type" NOT NULL,
    "partner_id" TEXT,
    "supplier_id" TEXT,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "from_template" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "segment_resources_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "route_templates" ADD CONSTRAINT "route_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_template_segments" ADD CONSTRAINT "route_template_segments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "route_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_template_resources" ADD CONSTRAINT "route_template_resources_template_segment_id_fkey" FOREIGN KEY ("template_segment_id") REFERENCES "route_template_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_template_resources" ADD CONSTRAINT "route_template_resources_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_template_resources" ADD CONSTRAINT "route_template_resources_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_segments" ADD CONSTRAINT "itinerary_segments_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_resources" ADD CONSTRAINT "segment_resources_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "itinerary_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_resources" ADD CONSTRAINT "segment_resources_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_resources" ADD CONSTRAINT "segment_resources_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
