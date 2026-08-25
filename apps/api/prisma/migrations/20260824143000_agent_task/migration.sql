-- #366: replace the development-only AI-create task identity with a generic AgentTask.
-- Agent runtime history is intentionally disposable at this development-stage cutover.
TRUNCATE TABLE "ai_create_tasks" CASCADE;

CREATE TYPE "agent_task_type" AS ENUM ('departure_creation');
CREATE TYPE "agent_task_status" AS ENUM (
  'proposed', 'active', 'waiting', 'completed', 'failed', 'cancelled', 'closed'
);
CREATE TYPE "input_batch_task_role" AS ENUM ('primary', 'referenced', 'created');
CREATE TYPE "task_activity_kind" AS ENUM (
  'goal', 'progress', 'waiting', 'business_object', 'completed', 'failed', 'cancelled', 'closed'
);

CREATE TABLE "agent_tasks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "type" "agent_task_type" NOT NULL,
  "goal" TEXT NOT NULL,
  "goal_version" INTEGER NOT NULL DEFAULT 1,
  "status" "agent_task_status" NOT NULL DEFAULT 'proposed',
  "status_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "agent_tasks_organization_id_owner_user_id_status_updated_at_idx"
  ON "agent_tasks"("organization_id", "owner_user_id", "status", "updated_at");

ALTER TABLE "ai_create_tasks"
  DROP CONSTRAINT "ai_create_tasks_organization_id_fkey",
  DROP CONSTRAINT "ai_create_tasks_creator_user_id_fkey",
  DROP COLUMN "organization_id",
  DROP COLUMN "creator_user_id",
  DROP COLUMN "status";
ALTER TABLE "ai_create_tasks" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "ai_create_tasks"
  ADD CONSTRAINT "ai_create_tasks_id_fkey" FOREIGN KEY ("id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_context_manifests" DROP COLUMN IF EXISTS "task_status";
DROP TYPE "ai_create_task_status";

ALTER TABLE "ai_create_idempotency_records" DROP CONSTRAINT "ai_create_idempotency_records_task_id_fkey";
ALTER TABLE "ai_create_idempotency_records" ADD CONSTRAINT "ai_create_idempotency_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_create_activity_runs" DROP CONSTRAINT "ai_create_activity_runs_task_id_fkey";
ALTER TABLE "ai_create_activity_runs" ADD CONSTRAINT "ai_create_activity_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_review_packages" DROP CONSTRAINT "ai_review_packages_task_id_fkey";
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_actions" DROP CONSTRAINT "ai_actions_task_id_fkey";
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_input_batches" DROP CONSTRAINT "ai_input_batches_task_id_fkey";
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_jobs" DROP CONSTRAINT "ai_workflow_jobs_task_id_fkey";
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_context_manifests" DROP CONSTRAINT "ai_context_manifests_task_id_fkey";
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_agent_attempts" DROP CONSTRAINT "ai_agent_attempts_task_id_fkey";
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "ai_conversations_task_id_status_updated_at_idx";
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_task_id_fkey";
ALTER TABLE "ai_conversations" DROP COLUMN "task_id";

CREATE TABLE "conversation_task_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "linked_by_user_id" TEXT NOT NULL,
  "link_reason" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_task_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_task_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_task_links_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_task_links_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversation_task_links_conversation_id_task_id_key" ON "conversation_task_links"("conversation_id", "task_id");
CREATE INDEX "conversation_task_links_task_id_linked_at_idx" ON "conversation_task_links"("task_id", "linked_at");
CREATE INDEX "conversation_task_links_organization_id_linked_at_idx" ON "conversation_task_links"("organization_id", "linked_at");

CREATE TABLE "input_batch_task_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "input_batch_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "role" "input_batch_task_role" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "input_batch_task_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "input_batch_task_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "input_batch_task_links_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "input_batch_task_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "input_batch_task_links_input_batch_id_task_id_role_key" ON "input_batch_task_links"("input_batch_id", "task_id", "role");
CREATE INDEX "input_batch_task_links_task_id_created_at_idx" ON "input_batch_task_links"("task_id", "created_at");
CREATE INDEX "input_batch_task_links_organization_id_created_at_idx" ON "input_batch_task_links"("organization_id", "created_at");

CREATE TABLE "task_activities" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "kind" "task_activity_kind" NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "task_activities_task_id_created_at_idx" ON "task_activities"("task_id", "created_at");
CREATE INDEX "task_activities_organization_id_created_at_idx" ON "task_activities"("organization_id", "created_at");
