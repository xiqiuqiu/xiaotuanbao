-- CreateEnum
CREATE TYPE "directory_profile_status" AS ENUM ('active', 'disabled', 'archived');

-- CreateEnum
CREATE TYPE "supplier_category" AS ENUM ('restaurant', 'hotel', 'transport', 'guide', 'scenic', 'shop', 'entertainment', 'insurance', 'ticket', 'other');

-- CreateEnum
CREATE TYPE "settlement_method" AS ENUM ('cash', 'prepay', 'postpay');

-- CreateEnum
CREATE TYPE "settlement_cycle" AS ENUM ('per_group', 'weekly', 'semi_monthly', 'monthly', 'as_agreed');

-- CreateEnum
CREATE TYPE "invoice_available" AS ENUM ('yes', 'no');

-- CreateEnum
CREATE TYPE "invoice_type" AS ENUM ('normal', 'special', 'unsupported');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "supplier_category" NOT NULL,
    "status" "directory_profile_status" NOT NULL DEFAULT 'active',
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "settlement_method" "settlement_method",
    "settlement_cycle" "settlement_cycle",
    "settlement_notes" TEXT,
    "reference_quote_notes" TEXT,
    "invoice_available" "invoice_available",
    "invoice_type" "invoice_type",
    "tax_rate" TEXT,
    "account_name" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "business_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
