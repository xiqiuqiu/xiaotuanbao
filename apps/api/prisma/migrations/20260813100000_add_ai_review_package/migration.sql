-- CreateEnum
CREATE TYPE "ai_review_package_status" AS ENUM ('pending', 'confirmed', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "ai_review_record_action" AS ENUM ('confirm', 'reject');

-- CreateEnum
CREATE TYPE "ai_review_write_result" AS ENUM ('success', 'conflict', 'permission_denied', 'validation_failed', 'rejected');

-- CreateTable
CREATE TABLE "ai_review_packages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "status" "ai_review_package_status" NOT NULL DEFAULT 'pending',
    "confirmation_unit" TEXT NOT NULL DEFAULT 'basic_info_draft',
    "base_object_version" INTEGER NOT NULL,
    "baseline_snapshot" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_review_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_review_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "operator_user_id" TEXT NOT NULL,
    "action" "ai_review_record_action" NOT NULL,
    "original_candidates" JSONB NOT NULL,
    "user_corrections" JSONB NOT NULL,
    "submitted_values" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "object_version" INTEGER NOT NULL,
    "write_result" "ai_review_write_result" NOT NULL,
    "conflict_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_review_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_review_packages_task_id_status_idx" ON "ai_review_packages"("task_id", "status");

-- CreateIndex
CREATE INDEX "ai_review_packages_organization_id_created_at_idx" ON "ai_review_packages"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_review_packages_one_pending_per_task" ON "ai_review_packages"("task_id") WHERE "status" = 'pending';

-- CreateIndex
CREATE INDEX "ai_review_records_package_id_created_at_idx" ON "ai_review_records"("package_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_review_records_organization_id_created_at_idx" ON "ai_review_records"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_create_activity_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_records" ADD CONSTRAINT "ai_review_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_records" ADD CONSTRAINT "ai_review_records_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "ai_review_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_records" ADD CONSTRAINT "ai_review_records_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
