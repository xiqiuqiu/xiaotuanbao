-- CreateEnum
CREATE TYPE "product_import_session_status" AS ENUM ('pending_confirmation', 'confirmed', 'discarded');

-- CreateTable
CREATE TABLE "product_import_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stored_object_id" TEXT NOT NULL,
    "status" "product_import_session_status" NOT NULL DEFAULT 'pending_confirmation',
    "original_filename" TEXT NOT NULL,
    "parse_result_json" JSONB NOT NULL,
    "embedded_ole_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_import_sessions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "products" ADD COLUMN "import_session_id" TEXT;
ALTER TABLE "products" ADD COLUMN "source_sheet_name" TEXT;

-- CreateIndex
CREATE INDEX "product_import_sessions_organization_id_created_at_idx" ON "product_import_sessions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "product_import_sessions_organization_id_status_idx" ON "product_import_sessions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "products_organization_id_import_session_id_idx" ON "products"("organization_id", "import_session_id");

-- CreateIndex
CREATE INDEX "products_organization_id_source_sheet_name_idx" ON "products"("organization_id", "source_sheet_name");

-- AddForeignKey
ALTER TABLE "product_import_sessions" ADD CONSTRAINT "product_import_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_sessions" ADD CONSTRAINT "product_import_sessions_stored_object_id_fkey" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_sessions" ADD CONSTRAINT "product_import_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_import_session_id_fkey" FOREIGN KEY ("import_session_id") REFERENCES "product_import_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
