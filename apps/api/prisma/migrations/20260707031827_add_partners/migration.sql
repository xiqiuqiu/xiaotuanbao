-- CreateEnum
CREATE TYPE "partner_kind" AS ENUM ('group_agent', 'peer', 'both');

-- CreateEnum
CREATE TYPE "partner_type" AS ENUM ('group_agency', 'local_agency', 'wholesaler', 'integrated_agency', 'other');

-- CreateEnum
CREATE TYPE "partner_contact_role" AS ENUM ('owner', 'operator', 'finance', 'sales', 'customer_service', 'other');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partner_kind" "partner_kind" NOT NULL,
    "partner_type" "partner_type" NOT NULL,
    "status" "directory_profile_status" NOT NULL DEFAULT 'active',
    "contact_name" TEXT,
    "contact_role" "partner_contact_role",
    "contact_phone" TEXT,
    "settlement_method" "settlement_method",
    "payment_term_rule" "settlement_cycle",
    "settlement_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_organization_id_name_key" ON "partners"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
