-- CreateEnum
CREATE TYPE "ai_conversation_status" AS ENUM ('open', 'abandoned', 'completed');

-- CreateEnum
CREATE TYPE "ai_conversation_event_kind" AS ENUM ('user_message', 'agent_message', 'batch_status', 'error');

-- CreateEnum
CREATE TYPE "ai_input_batch_status" AS ENUM ('waiting_for_materials', 'ready_for_agent', 'agent_running', 'awaiting_user_input', 'awaiting_review', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ai_workflow_job_type" AS ENUM ('agent_batch');

-- CreateEnum
CREATE TYPE "ai_workflow_job_status" AS ENUM ('pending', 'claimed', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ai_agent_attempt_status" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "status" "ai_conversation_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "ai_conversation_event_kind" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_input_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "user_message_event_id" TEXT NOT NULL,
    "conversation_version" INTEGER NOT NULL,
    "status" "ai_input_batch_status" NOT NULL DEFAULT 'ready_for_agent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_input_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflow_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "type" "ai_workflow_job_type" NOT NULL DEFAULT 'agent_batch',
    "status" "ai_workflow_job_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "claimed_by" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_manifests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "conversation_version" INTEGER NOT NULL,
    "event_sequences" JSONB NOT NULL,
    "business_snapshot_version" INTEGER NOT NULL,
    "builder_version" TEXT NOT NULL,
    "system_prompt_version" TEXT NOT NULL,
    "tool_schema_version" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "truncation_reasons" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "activity_run_id" TEXT NOT NULL,
    "context_manifest_id" TEXT NOT NULL,
    "status" "ai_agent_attempt_status" NOT NULL DEFAULT 'running',
    "result_json" JSONB,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "ai_agent_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_task_id_status_updated_at_idx" ON "ai_conversations"("task_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_organization_id_creator_user_id_status_idx" ON "ai_conversations"("organization_id", "creator_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_events_conversation_id_sequence_key" ON "ai_conversation_events"("conversation_id", "sequence");

-- CreateIndex
CREATE INDEX "ai_conversation_events_organization_id_created_at_idx" ON "ai_conversation_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_input_batches_task_id_status_idx" ON "ai_input_batches"("task_id", "status");

-- CreateIndex
CREATE INDEX "ai_input_batches_conversation_id_created_at_idx" ON "ai_input_batches"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_input_batches_organization_id_created_at_idx" ON "ai_input_batches"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_input_batches_one_running_per_task" ON "ai_input_batches"("task_id") WHERE "status" = 'agent_running';

-- CreateIndex
CREATE UNIQUE INDEX "ai_workflow_jobs_input_batch_id_type_key" ON "ai_workflow_jobs"("input_batch_id", "type");

-- CreateIndex
CREATE INDEX "ai_workflow_jobs_status_next_attempt_at_type_idx" ON "ai_workflow_jobs"("status", "next_attempt_at", "type");

-- CreateIndex
CREATE INDEX "ai_workflow_jobs_task_id_status_idx" ON "ai_workflow_jobs"("task_id", "status");

-- CreateIndex
CREATE INDEX "ai_workflow_jobs_organization_id_created_at_idx" ON "ai_workflow_jobs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_context_manifests_conversation_id_input_batch_id_idx" ON "ai_context_manifests"("conversation_id", "input_batch_id");

-- CreateIndex
CREATE INDEX "ai_context_manifests_organization_id_created_at_idx" ON "ai_context_manifests"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_attempts_context_manifest_id_key" ON "ai_agent_attempts"("context_manifest_id");

-- CreateIndex
CREATE INDEX "ai_agent_attempts_task_id_status_idx" ON "ai_agent_attempts"("task_id", "status");

-- CreateIndex
CREATE INDEX "ai_agent_attempts_job_id_started_at_idx" ON "ai_agent_attempts"("job_id", "started_at");

-- CreateIndex
CREATE INDEX "ai_agent_attempts_organization_id_started_at_idx" ON "ai_agent_attempts"("organization_id", "started_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_events" ADD CONSTRAINT "ai_conversation_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_events" ADD CONSTRAINT "ai_conversation_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_user_message_event_id_fkey" FOREIGN KEY ("user_message_event_id") REFERENCES "ai_conversation_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_workflow_jobs" ADD CONSTRAINT "ai_workflow_jobs_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ai_workflow_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_activity_run_id_fkey" FOREIGN KEY ("activity_run_id") REFERENCES "ai_create_activity_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_attempts" ADD CONSTRAINT "ai_agent_attempts_context_manifest_id_fkey" FOREIGN KEY ("context_manifest_id") REFERENCES "ai_context_manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
