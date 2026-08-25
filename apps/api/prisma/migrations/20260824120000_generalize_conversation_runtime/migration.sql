-- Generalize conversation runtime: optional taskId, conversation-level run lock, generation fencing.

CREATE TYPE "ai_conversation_title_source" AS ENUM ('first_message', 'agent', 'user');

ALTER TABLE "ai_conversations"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "title_source" "ai_conversation_title_source" NOT NULL DEFAULT 'first_message',
  ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ai_conversations" SET "last_activity_at" = "updated_at";

ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_task_id_fkey";
ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_conversations_org_creator_activity_idx"
  ON "ai_conversations"("organization_id", "creator_user_id", "last_activity_at");

ALTER TABLE "ai_input_batches" ALTER COLUMN "task_id" DROP NOT NULL;
ALTER TABLE "ai_input_batches" DROP CONSTRAINT "ai_input_batches_task_id_fkey";
ALTER TABLE "ai_input_batches"
  ADD CONSTRAINT "ai_input_batches_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "ai_input_batches_one_running_per_task";
CREATE UNIQUE INDEX "ai_input_batches_one_agent_running_per_conversation"
  ON "ai_input_batches"("conversation_id")
  WHERE "status" = 'agent_running';

ALTER TABLE "ai_workflow_jobs"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_workflow_jobs" DROP CONSTRAINT "ai_workflow_jobs_task_id_fkey";
ALTER TABLE "ai_workflow_jobs"
  ADD CONSTRAINT "ai_workflow_jobs_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_context_manifests" ALTER COLUMN "task_id" DROP NOT NULL;
ALTER TABLE "ai_context_manifests" DROP CONSTRAINT "ai_context_manifests_task_id_fkey";
ALTER TABLE "ai_context_manifests"
  ADD CONSTRAINT "ai_context_manifests_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_agent_attempts"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ALTER COLUMN "activity_run_id" DROP NOT NULL,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_agent_attempts" DROP CONSTRAINT "ai_agent_attempts_task_id_fkey";
ALTER TABLE "ai_agent_attempts"
  ADD CONSTRAINT "ai_agent_attempts_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_agent_attempts_conversation_id_status_idx"
  ON "ai_agent_attempts"("conversation_id", "status");
CREATE UNIQUE INDEX "ai_agent_attempts_one_running_per_conversation"
  ON "ai_agent_attempts"("conversation_id")
  WHERE "status" = 'running';

ALTER TABLE "ai_create_idempotency_records" ALTER COLUMN "task_id" DROP NOT NULL;
ALTER TABLE "ai_create_idempotency_records" DROP CONSTRAINT "ai_create_idempotency_records_task_id_fkey";
ALTER TABLE "ai_create_idempotency_records"
  ADD CONSTRAINT "ai_create_idempotency_records_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
