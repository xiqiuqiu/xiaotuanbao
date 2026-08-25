-- #367: generic Review Package envelope and concurrent proposal identity.
ALTER TYPE "ai_review_package_status" ADD VALUE IF NOT EXISTS 'conflict';
ALTER TYPE "ai_review_package_status" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "ai_review_record_action" ADD VALUE IF NOT EXISTS 'cancel';

ALTER TABLE "ai_review_packages"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN "conversation_id" TEXT,
  ADD COLUMN "attempt_id" TEXT,
  ADD COLUMN "payload_schema" TEXT NOT NULL DEFAULT 'departure.basic_info_draft@v1',
  ADD COLUMN "capability_key" TEXT NOT NULL DEFAULT 'departure.review-package.propose',
  ADD COLUMN "capability_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "target_kind" TEXT NOT NULL DEFAULT 'departure_creation_draft',
  ADD COLUMN "target_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "proposal_hash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "user_corrections" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ai_review_packages" DROP CONSTRAINT "ai_review_packages_task_id_fkey";
ALTER TABLE "ai_review_packages"
  ADD CONSTRAINT "ai_review_packages_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_review_packages"
  ADD CONSTRAINT "ai_review_packages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_review_packages"
  ADD CONSTRAINT "ai_review_packages_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "ai_agent_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ai_review_packages" AS pkg
SET "conversation_id" = batch."conversation_id"
FROM "ai_input_batches" AS batch
WHERE pkg."input_batch_id" = batch."id"
  AND pkg."conversation_id" IS NULL;

UPDATE "ai_review_packages" AS pkg
SET
  "conversation_id" = COALESCE(pkg."conversation_id", action."conversation_id"),
  "input_batch_id" = COALESCE(pkg."input_batch_id", action."input_batch_id"),
  "attempt_id" = COALESCE(pkg."attempt_id", action."attempt_id")
FROM "ai_actions" AS action
WHERE pkg."source_action_id" = action."id";

UPDATE "ai_review_packages" AS pkg
SET "target_id" = draft."id"
FROM "departure_creation_drafts" AS draft
WHERE draft."task_id" = pkg."task_id"
  AND pkg."target_id" = '';

UPDATE "ai_review_packages"
SET "proposal_hash" = encode(sha256(convert_to("candidates"::text, 'UTF8')), 'hex')
WHERE "proposal_hash" = '';

CREATE UNIQUE INDEX "ai_review_packages_proposal_identity_key"
  ON "ai_review_packages"("input_batch_id", "capability_version", "target_kind", "target_id", "proposal_hash");
CREATE INDEX "ai_review_packages_conversation_id_status_idx"
  ON "ai_review_packages"("conversation_id", "status");
CREATE INDEX "ai_review_packages_target_status_idx"
  ON "ai_review_packages"("organization_id", "target_kind", "target_id", "status");
CREATE INDEX "ai_review_packages_attempt_id_idx"
  ON "ai_review_packages"("attempt_id");

ALTER TABLE "ai_review_records"
  ADD COLUMN "decision_command_id" TEXT;
CREATE UNIQUE INDEX "ai_review_records_decision_identity_key"
  ON "ai_review_records"("package_id", "decision_command_id");
