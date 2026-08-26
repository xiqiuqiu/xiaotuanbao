-- #384: deterministic AI context compaction versions and preparing_context batch status.
ALTER TYPE "ai_input_batch_status" ADD VALUE IF NOT EXISTS 'preparing_context';

CREATE TYPE "ai_context_compaction_version_status" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE "ai_context_compaction_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ai_context_compaction_version_status" NOT NULL DEFAULT 'pending',
    "conversation_version_ceiling" INTEGER NOT NULL,
    "covered_sequence_start" INTEGER NOT NULL,
    "covered_sequence_end" INTEGER NOT NULL,
    "covered_event_sequences" JSONB NOT NULL,
    "policy_version" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "input_digest" TEXT NOT NULL,
    "locators" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_context_compaction_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_compaction_conversation_version_key" ON "ai_context_compaction_versions"("conversation_id", "version");
CREATE UNIQUE INDEX "ai_compaction_input_digest_key" ON "ai_context_compaction_versions"("conversation_id", "input_digest", "policy_version");
CREATE INDEX "ai_compaction_org_created_idx" ON "ai_context_compaction_versions"("organization_id", "created_at");

ALTER TABLE "ai_context_compaction_versions" ADD CONSTRAINT "ai_context_compaction_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_context_compaction_versions" ADD CONSTRAINT "ai_context_compaction_versions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
