-- AlterTable
ALTER TABLE "ai_context_manifests" ADD COLUMN "summary_version" INTEGER,
ADD COLUMN "excerpt_digests" JSONB NOT NULL DEFAULT '[]';

-- DropIndex
DROP INDEX "ai_agent_attempts_context_manifest_id_key";

-- CreateIndex
CREATE INDEX "ai_agent_attempts_context_manifest_id_idx" ON "ai_agent_attempts"("context_manifest_id");

-- CreateIndex
CREATE INDEX "ai_context_manifests_input_batch_id_input_hash_idx" ON "ai_context_manifests"("input_batch_id", "input_hash");
