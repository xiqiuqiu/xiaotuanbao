-- Conversation-private sources replace task-owned DepartureMaterial uploads.
-- Formal departure attachments stay in departure_materials, but no longer own parse/runtime.

ALTER TABLE "ai_workflow_jobs" DROP CONSTRAINT IF EXISTS "ai_workflow_jobs_material_id_fkey";
ALTER TABLE "ai_input_batch_materials" DROP CONSTRAINT IF EXISTS "ai_input_batch_materials_material_id_fkey";
ALTER TABLE "ai_input_batch_materials" DROP CONSTRAINT IF EXISTS "ai_input_batch_materials_input_batch_id_fkey";
ALTER TABLE "ai_input_batch_materials" DROP CONSTRAINT IF EXISTS "ai_input_batch_materials_organization_id_fkey";
ALTER TABLE "departure_material_parse_runs" DROP CONSTRAINT IF EXISTS "departure_material_parse_runs_material_id_fkey";
ALTER TABLE "departure_material_parse_runs" DROP CONSTRAINT IF EXISTS "departure_material_parse_runs_organization_id_fkey";
ALTER TABLE "departure_materials" DROP CONSTRAINT IF EXISTS "departure_materials_task_id_fkey";
ALTER TABLE "departure_materials" DROP CONSTRAINT IF EXISTS "departure_materials_stored_object_id_fkey";
ALTER TABLE "departure_materials" DROP CONSTRAINT IF EXISTS "departure_materials_created_by_user_id_fkey";
ALTER TABLE "departure_materials" DROP CONSTRAINT IF EXISTS "departure_materials_organization_id_fkey";

DROP TABLE IF EXISTS "ai_input_batch_materials";
DROP TABLE IF EXISTS "departure_material_parse_runs";
DROP TABLE IF EXISTS "departure_materials";

DROP TYPE IF EXISTS "departure_material_status";
DROP TYPE IF EXISTS "departure_material_parse_run_status";

ALTER TABLE "ai_workflow_jobs" DROP COLUMN IF EXISTS "material_id";
DROP INDEX IF EXISTS "ai_workflow_jobs_material_id_idx";

CREATE TYPE "conversation_source_kind" AS ENUM ('upload', 'web_result', 'tool_result', 'generated_file');
CREATE TYPE "conversation_source_status" AS ENUM ('uploaded', 'queued', 'parsing', 'available', 'partially_available', 'failed', 'isolated');
CREATE TYPE "conversation_source_parse_run_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE "conversation_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "kind" "conversation_source_kind" NOT NULL DEFAULT 'upload',
    "stored_object_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "conversation_source_status" NOT NULL DEFAULT 'uploaded',
    "status_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_source_parse_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "conversation_source_parse_run_status" NOT NULL DEFAULT 'queued',
    "result_version" INTEGER NOT NULL,
    "pages" JSONB,
    "parser_versions" JSONB NOT NULL,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_source_parse_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "input_batch_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "parse_version" INTEGER,
    "content_digest" TEXT,
    "locator" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_batch_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "departure_materials" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "source_id" TEXT,
    "stored_object_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "parse_version" INTEGER,
    "content_digest" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_materials_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_workflow_jobs" ADD COLUMN "source_id" TEXT;

ALTER TABLE "ai_context_manifests" ADD COLUMN "source_versions" JSONB NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX "conversation_sources_conversation_id_sha256_size_bytes_content_type_key"
  ON "conversation_sources"("conversation_id", "sha256", "size_bytes", "content_type");
CREATE INDEX "conversation_sources_conversation_id_created_at_idx" ON "conversation_sources"("conversation_id", "created_at");
CREATE INDEX "conversation_sources_organization_id_created_at_idx" ON "conversation_sources"("organization_id", "created_at");

CREATE INDEX "conversation_source_parse_runs_source_id_result_version_idx" ON "conversation_source_parse_runs"("source_id", "result_version");
CREATE INDEX "conversation_source_parse_runs_organization_id_created_at_idx" ON "conversation_source_parse_runs"("organization_id", "created_at");

CREATE UNIQUE INDEX "input_batch_sources_input_batch_id_source_id_key" ON "input_batch_sources"("input_batch_id", "source_id");
CREATE INDEX "input_batch_sources_source_id_idx" ON "input_batch_sources"("source_id");
CREATE INDEX "input_batch_sources_organization_id_created_at_idx" ON "input_batch_sources"("organization_id", "created_at");

CREATE UNIQUE INDEX "departure_materials_departure_id_source_id_key" ON "departure_materials"("departure_id", "source_id");
CREATE INDEX "departure_materials_departure_id_created_at_idx" ON "departure_materials"("departure_id", "created_at");
CREATE INDEX "departure_materials_organization_id_created_at_idx" ON "departure_materials"("organization_id", "created_at");
CREATE INDEX "ai_workflow_jobs_source_id_idx" ON "ai_workflow_jobs"("source_id");

ALTER TABLE "conversation_sources"
  ADD CONSTRAINT "conversation_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversation_sources_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversation_sources_stored_object_id_fkey" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "conversation_sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversation_source_parse_runs"
  ADD CONSTRAINT "conversation_source_parse_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversation_source_parse_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "conversation_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "input_batch_sources"
  ADD CONSTRAINT "input_batch_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "input_batch_sources_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "input_batch_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "conversation_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "departure_materials"
  ADD CONSTRAINT "departure_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "departure_materials_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "departure_materials_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "conversation_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "departure_materials_stored_object_id_fkey" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "departure_materials_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_workflow_jobs"
  ADD CONSTRAINT "ai_workflow_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "conversation_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
