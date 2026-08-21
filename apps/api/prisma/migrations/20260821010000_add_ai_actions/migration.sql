-- CreateEnum
CREATE TYPE "ai_action_decision" AS ENUM ('allow', 'review', 'deny');

-- CreateEnum
CREATE TYPE "ai_action_kind" AS ENUM ('read', 'write');

-- CreateEnum
CREATE TYPE "ai_action_execution_status" AS ENUM ('not_started', 'succeeded', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT,
    "task_id" TEXT,
    "conversation_id" TEXT,
    "input_batch_id" TEXT,
    "run_id" TEXT,
    "attempt_id" TEXT,
    "context_manifest_id" TEXT,
    "name" TEXT NOT NULL,
    "kind" "ai_action_kind" NOT NULL,
    "decision" "ai_action_decision" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "target_kind" TEXT,
    "target_id" TEXT,
    "input_hash" TEXT NOT NULL,
    "candidate_field_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "execution_status" "ai_action_execution_status" NOT NULL DEFAULT 'not_started',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ai_review_packages" ADD COLUMN "source_action_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_actions_organization_id_created_at_idx" ON "ai_actions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_actions_task_id_created_at_idx" ON "ai_actions"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_review_packages_source_action_id_idx" ON "ai_review_packages"("source_action_id");

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_create_activity_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ai_agent_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_context_manifest_id_fkey" FOREIGN KEY ("context_manifest_id") REFERENCES "ai_context_manifests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_source_action_id_fkey" FOREIGN KEY ("source_action_id") REFERENCES "ai_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
