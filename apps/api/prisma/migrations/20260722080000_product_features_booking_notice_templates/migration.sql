-- AlterTable
ALTER TABLE "products" ADD COLUMN "booking_notice_template_id" TEXT;

-- CreateTable
CREATE TABLE "booking_notice_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_notice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_features" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_notice_templates_organization_id_updated_at_idx" ON "booking_notice_templates"("organization_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_notice_templates_organization_id_name_key" ON "booking_notice_templates"("organization_id", "name");

-- CreateIndex
CREATE INDEX "product_features_product_id_sort_order_idx" ON "product_features"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "products_booking_notice_template_id_idx" ON "products"("booking_notice_template_id");

-- AddForeignKey
ALTER TABLE "booking_notice_templates" ADD CONSTRAINT "booking_notice_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_booking_notice_template_id_fkey" FOREIGN KEY ("booking_notice_template_id") REFERENCES "booking_notice_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing features_text → single Product Feature row
INSERT INTO "product_features" ("id", "product_id", "title", "description", "sort_order", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  p.id,
  '',
  p.features_text,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products" p
WHERE p.features_text IS NOT NULL AND btrim(p.features_text) <> '';
