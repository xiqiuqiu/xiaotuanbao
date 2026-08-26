-- #385: versioned oversized-input source indexes for lossless chunk extract/merge.
CREATE TYPE "ai_source_index_version_status" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE "ai_source_index_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "origin_kind" TEXT NOT NULL,
    "origin_event_id" TEXT,
    "origin_source_id" TEXT,
    "origin_parse_version" INTEGER,
    "version" INTEGER NOT NULL,
    "status" "ai_source_index_version_status" NOT NULL DEFAULT 'pending',
    "policy_version" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "extract_schema_version" TEXT NOT NULL,
    "chunk_count" INTEGER NOT NULL,
    "chunks" JSONB NOT NULL,
    "index_json" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "input_digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_source_index_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_source_index_conversation_version_key" ON "ai_source_index_versions"("conversation_id", "version");
CREATE UNIQUE INDEX "ai_source_index_input_digest_key" ON "ai_source_index_versions"("conversation_id", "input_digest", "policy_version");
CREATE INDEX "ai_source_index_org_created_idx" ON "ai_source_index_versions"("organization_id", "created_at");
CREATE INDEX "ai_source_index_batch_idx" ON "ai_source_index_versions"("input_batch_id");

ALTER TABLE "ai_source_index_versions" ADD CONSTRAINT "ai_source_index_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_source_index_versions" ADD CONSTRAINT "ai_source_index_versions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_source_index_versions" ADD CONSTRAINT "ai_source_index_versions_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_context_manifests" ADD COLUMN "source_index_version" INTEGER;
