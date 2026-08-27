-- Same-batch Agent continuation writes a second Context Manifest with a new
-- input_hash. A leftover unique on (input_batch_id, manifest_version=1) maps
-- that insert to AGENT_UNAVAILABLE. Drop schema-drift columns/indexes that
-- Prisma no longer owns.
ALTER TABLE "ai_context_manifests" DROP CONSTRAINT IF EXISTS "ai_context_manifests_summary_id_fkey";

DROP INDEX IF EXISTS "ai_context_manifests_input_batch_id_manifest_version_key";
DROP INDEX IF EXISTS "ai_context_manifests_summary_id_idx";

ALTER TABLE "ai_context_manifests"
  DROP COLUMN IF EXISTS "manifest_version",
  DROP COLUMN IF EXISTS "business_snapshot",
  DROP COLUMN IF EXISTS "review_snapshot",
  DROP COLUMN IF EXISTS "available_capabilities",
  DROP COLUMN IF EXISTS "summary_id",
  DROP COLUMN IF EXISTS "material_fragment_refs",
  DROP COLUMN IF EXISTS "budget_policy",
  DROP COLUMN IF EXISTS "budget_usage",
  DROP COLUMN IF EXISTS "task_phase";

DROP INDEX IF EXISTS "ai_context_manifests_input_batch_id_input_hash_key";
CREATE INDEX IF NOT EXISTS "ai_context_manifests_input_batch_id_input_hash_idx"
  ON "ai_context_manifests"("input_batch_id", "input_hash");
