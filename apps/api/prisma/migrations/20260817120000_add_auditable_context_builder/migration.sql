CREATE TABLE "ai_conversation_summaries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "through_sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source_event_sequences" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_summaries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_context_manifests"
    ADD COLUMN "manifest_version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "business_snapshot" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "review_snapshot" JSONB,
    ADD COLUMN "available_capabilities" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "summary_id" TEXT,
    ADD COLUMN "summary_version" INTEGER,
    ADD COLUMN "material_fragment_refs" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "budget_policy" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "budget_usage" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "task_status" "ai_create_task_status" NOT NULL DEFAULT 'in_progress',
    ADD COLUMN "task_phase" "ai_create_phase" NOT NULL DEFAULT 'basic_info';

ALTER TABLE "ai_workflow_jobs"
    ADD COLUMN "claimed_conversation_version" INTEGER;

CREATE TABLE "ai_context_material_reads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "context_manifest_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "parse_result_version" INTEGER NOT NULL,
    "page_number" INTEGER NOT NULL,
    "read_sequence" INTEGER NOT NULL,
    "text_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_context_material_reads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_context_material_reads_context_manifest_id_read_sequence_key"
    ON "ai_context_material_reads"("context_manifest_id", "read_sequence");
CREATE INDEX "ai_context_material_reads_context_manifest_id_material_id_parse_result_version_page_number_idx"
    ON "ai_context_material_reads"("context_manifest_id", "material_id", "parse_result_version", "page_number");
CREATE INDEX "ai_context_material_reads_organization_id_created_at_idx"
    ON "ai_context_material_reads"("organization_id", "created_at");
ALTER TABLE "ai_context_material_reads"
    ADD CONSTRAINT "ai_context_material_reads_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_context_material_reads"
    ADD CONSTRAINT "ai_context_material_reads_context_manifest_id_fkey"
    FOREIGN KEY ("context_manifest_id") REFERENCES "ai_context_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_agent_attempts"
    ADD COLUMN "final_input_hash" TEXT;

CREATE UNIQUE INDEX "ai_conversation_summaries_conversation_id_version_key"
    ON "ai_conversation_summaries"("conversation_id", "version");
CREATE INDEX "ai_conversation_summaries_conversation_id_through_sequence_idx"
    ON "ai_conversation_summaries"("conversation_id", "through_sequence");
CREATE INDEX "ai_conversation_summaries_organization_id_created_at_idx"
    ON "ai_conversation_summaries"("organization_id", "created_at");
WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "input_batch_id" ORDER BY "created_at" ASC, "id" ASC
    ) AS "manifest_version"
    FROM "ai_context_manifests"
)
UPDATE "ai_context_manifests" AS manifest
SET "manifest_version" = ranked."manifest_version"
FROM ranked
WHERE manifest."id" = ranked."id";
CREATE UNIQUE INDEX "ai_context_manifests_input_batch_id_manifest_version_key"
    ON "ai_context_manifests"("input_batch_id", "manifest_version");
CREATE INDEX "ai_context_manifests_summary_id_idx"
    ON "ai_context_manifests"("summary_id");

ALTER TABLE "ai_conversation_summaries"
    ADD CONSTRAINT "ai_conversation_summaries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_conversation_summaries"
    ADD CONSTRAINT "ai_conversation_summaries_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_conversation_summaries"
    ADD CONSTRAINT "ai_conversation_summaries_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_context_manifests"
    ADD CONSTRAINT "ai_context_manifests_summary_id_fkey"
    FOREIGN KEY ("summary_id") REFERENCES "ai_conversation_summaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
