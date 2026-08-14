-- AlterEnum
ALTER TYPE "ai_workflow_job_type" ADD VALUE 'material_parse';

-- CreateEnum
CREATE TYPE "departure_material_status" AS ENUM ('uploaded', 'queued', 'parsing', 'available', 'partially_available', 'failed', 'isolated');

-- CreateEnum
CREATE TYPE "departure_material_parse_run_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "ai_workflow_jobs" ADD COLUMN "material_id" TEXT,
ADD COLUMN "job_key" TEXT;

UPDATE "ai_workflow_jobs"
SET "job_key" = 'agent_batch:' || "input_batch_id"
WHERE "job_key" IS NULL;

ALTER TABLE "ai_workflow_jobs" ALTER COLUMN "job_key" SET NOT NULL;

DROP INDEX "ai_workflow_jobs_input_batch_id_type_key";

CREATE UNIQUE INDEX "ai_workflow_jobs_job_key_key" ON "ai_workflow_jobs"("job_key");

CREATE INDEX "ai_workflow_jobs_material_id_idx" ON "ai_workflow_jobs"("material_id");

-- AlterTable
ALTER TABLE "ai_context_manifests" ADD COLUMN "material_versions" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "departure_materials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "stored_object_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "departure_material_status" NOT NULL DEFAULT 'uploaded',
    "status_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_material_parse_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "status" "departure_material_parse_run_status" NOT NULL DEFAULT 'queued',
    "result_version" INTEGER NOT NULL,
    "pages" JSONB,
    "parser_versions" JSONB NOT NULL,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_material_parse_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_input_batch_materials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "parse_result_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_input_batch_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departure_materials_task_id_sha256_size_bytes_content_type_key" ON "departure_materials"("task_id", "sha256", "size_bytes", "content_type");

-- CreateIndex
CREATE INDEX "departure_materials_task_id_created_at_idx" ON "departure_materials"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "departure_materials_organization_id_created_at_idx" ON "departure_materials"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "departure_material_parse_runs_material_id_result_version_idx" ON "departure_material_parse_runs"("material_id", "result_version");

-- CreateIndex
CREATE INDEX "departure_material_parse_runs_organization_id_created_at_idx" ON "departure_material_parse_runs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_input_batch_materials_input_batch_id_material_id_key" ON "ai_input_batch_materials"("input_batch_id", "material_id");

-- CreateIndex
CREATE INDEX "ai_input_batch_materials_material_id_idx" ON "ai_input_batch_materials"("material_id");

-- CreateIndex
CREATE INDEX "ai_input_batch_materials_organization_id_created_at_idx" ON "ai_input_batch_materials"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "departure_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_materials" ADD CONSTRAINT "departure_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_materials" ADD CONSTRAINT "departure_materials_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_materials" ADD CONSTRAINT "departure_materials_stored_object_id_fkey" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_materials" ADD CONSTRAINT "departure_materials_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_material_parse_runs" ADD CONSTRAINT "departure_material_parse_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_material_parse_runs" ADD CONSTRAINT "departure_material_parse_runs_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "departure_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batch_materials" ADD CONSTRAINT "ai_input_batch_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batch_materials" ADD CONSTRAINT "ai_input_batch_materials_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batch_materials" ADD CONSTRAINT "ai_input_batch_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "departure_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
