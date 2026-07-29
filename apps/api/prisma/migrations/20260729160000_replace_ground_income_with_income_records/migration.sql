-- CreateEnum
CREATE TYPE "departure_income_type" AS ENUM ('shopping_rebate', 'coach_sales', 'optional_tour', 'other');

-- CreateEnum
CREATE TYPE "departure_income_collection_status" AS ENUM ('uncollected', 'collected');

-- CreateEnum
CREATE TYPE "departure_income_commission_status" AS ENUM ('unpaid', 'paid');

-- CreateTable
CREATE TABLE "departure_income_records" (
    "id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "type" "departure_income_type" NOT NULL,
    "project_name" VARCHAR(50) NOT NULL,
    "partner_supplier_id" TEXT,
    "occurred_on" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "guide_supplier_id" TEXT,
    "commission_cents" INTEGER NOT NULL DEFAULT 0,
    "income_status" "departure_income_collection_status" NOT NULL DEFAULT 'uncollected',
    "commission_status" "departure_income_commission_status" NOT NULL DEFAULT 'unpaid',
    "remark" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_income_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_income_records_departure_id_created_at_idx" ON "departure_income_records"("departure_id", "created_at");

-- AddForeignKey
ALTER TABLE "departure_income_records" ADD CONSTRAINT "departure_income_records_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_income_records" ADD CONSTRAINT "departure_income_records_partner_supplier_id_fkey" FOREIGN KEY ("partner_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_income_records" ADD CONSTRAINT "departure_income_records_guide_supplier_id_fkey" FOREIGN KEY ("guide_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing ground_incomes → other 增收（项目名称=原标题，提成 0，未收/未付）
INSERT INTO "departure_income_records" (
  "id",
  "departure_id",
  "type",
  "project_name",
  "partner_supplier_id",
  "occurred_on",
  "amount_cents",
  "guide_supplier_id",
  "commission_cents",
  "income_status",
  "commission_status",
  "remark",
  "created_at",
  "updated_at"
)
SELECT
  gi."id",
  gi."departure_id",
  'other'::"departure_income_type",
  LEFT(gi."title", 50),
  NULL,
  (gi."created_at" AT TIME ZONE 'UTC')::date,
  gi."amount_cents",
  NULL,
  0,
  'uncollected'::"departure_income_collection_status",
  'unpaid'::"departure_income_commission_status",
  NULL,
  gi."created_at",
  gi."updated_at"
FROM "ground_incomes" gi;

-- DropTable
DROP TABLE "ground_incomes";
