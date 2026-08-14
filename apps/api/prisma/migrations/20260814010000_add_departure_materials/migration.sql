-- AlterTable
ALTER TABLE "stored_objects" ADD COLUMN "content_sha256" TEXT;

-- CreateIndex
CREATE INDEX "stored_objects_organization_id_content_sha256_idx" ON "stored_objects"("organization_id", "content_sha256");

-- CreateEnum
CREATE TYPE "departure_material_status" AS ENUM ('uploaded', 'queued', 'parsing', 'available', 'partially_available', 'failed', 'isolated');

-- CreateEnum
CREATE TYPE "departure_material_parse_run_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "departure_materials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "stored_object_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
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
    "error_message" TEXT,
    "consume_started_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_material_parse_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_materials_task_id_created_at_idx" ON "departure_materials"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "departure_materials_organization_id_created_at_idx" ON "departure_materials"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "departure_material_parse_runs_material_id_result_version_idx" ON "departure_material_parse_runs"("material_id", "result_version");

-- CreateIndex
CREATE INDEX "departure_material_parse_runs_organization_id_created_at_idx" ON "departure_material_parse_runs"("organization_id", "created_at");

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
