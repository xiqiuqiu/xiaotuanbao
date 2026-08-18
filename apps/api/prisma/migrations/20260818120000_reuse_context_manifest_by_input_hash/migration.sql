-- Attempt is an execution trace; a frozen context manifest can be reused
-- across retries of the same input hash.
ALTER TABLE "ai_agent_attempts"
    DROP CONSTRAINT IF EXISTS "ai_agent_attempts_context_manifest_id_key";
DROP INDEX IF EXISTS "ai_agent_attempts_context_manifest_id_key";

CREATE INDEX IF NOT EXISTS "ai_agent_attempts_context_manifest_id_idx"
    ON "ai_agent_attempts"("context_manifest_id");

-- Keep the lowest manifest_version for each (input_batch_id, input_hash)
-- and retarget attempts before deleting duplicates.
UPDATE "ai_agent_attempts" AS attempt
SET "context_manifest_id" = kept.id
FROM "ai_context_manifests" AS duplicate
JOIN LATERAL (
    SELECT first.id
    FROM "ai_context_manifests" AS first
    WHERE first."input_batch_id" = duplicate."input_batch_id"
      AND first."input_hash" = duplicate."input_hash"
    ORDER BY first."manifest_version" ASC, first."id" ASC
    LIMIT 1
) AS kept ON TRUE
WHERE attempt."context_manifest_id" = duplicate.id
  AND duplicate.id <> kept.id;

DELETE FROM "ai_context_manifests" AS duplicate
USING (
    SELECT
        "input_batch_id",
        "input_hash",
        MIN("manifest_version") AS "keep_version"
    FROM "ai_context_manifests"
    GROUP BY "input_batch_id", "input_hash"
) AS kept
WHERE duplicate."input_batch_id" = kept."input_batch_id"
  AND duplicate."input_hash" = kept."input_hash"
  AND duplicate."manifest_version" > kept."keep_version";

CREATE UNIQUE INDEX "ai_context_manifests_input_batch_id_input_hash_key"
    ON "ai_context_manifests"("input_batch_id", "input_hash");
