-- #447: 已有发团协作、事项身份、修订记录与确认作业。
ALTER TYPE "agent_task_type" ADD VALUE IF NOT EXISTS 'departure_collaboration';
ALTER TYPE "ai_review_record_action" ADD VALUE IF NOT EXISTS 'revise';
ALTER TYPE "ai_workflow_job_type" ADD VALUE IF NOT EXISTS 'review_confirm';

ALTER TABLE "agent_tasks" ADD COLUMN "departure_id" TEXT;
ALTER TABLE "agent_tasks"
  ADD CONSTRAINT "agent_tasks_departure_id_fkey"
  FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "agent_tasks_organization_id_departure_id_idx"
  ON "agent_tasks"("organization_id", "departure_id");

CREATE TABLE "conversation_departure_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "departure_id" TEXT NOT NULL,
  "linked_by_user_id" TEXT NOT NULL,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_departure_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_departure_links_conversation_id_departure_id_key"
  ON "conversation_departure_links"("conversation_id", "departure_id");
CREATE INDEX "conversation_departure_links_departure_id_linked_at_idx"
  ON "conversation_departure_links"("departure_id", "linked_at");
CREATE INDEX "conversation_departure_links_organization_id_linked_at_idx"
  ON "conversation_departure_links"("organization_id", "linked_at");

ALTER TABLE "conversation_departure_links"
  ADD CONSTRAINT "conversation_departure_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_departure_links"
  ADD CONSTRAINT "conversation_departure_links_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_departure_links"
  ADD CONSTRAINT "conversation_departure_links_departure_id_fkey"
  FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_departure_links"
  ADD CONSTRAINT "conversation_departure_links_linked_by_user_id_fkey"
  FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "conversation_departure_links" (
  "id",
  "organization_id",
  "conversation_id",
  "departure_id",
  "linked_by_user_id",
  "linked_at"
)
SELECT
  md5(task."id" || ':' || conv_link."conversation_id"),
  task."organization_id",
  conv_link."conversation_id",
  create_task."departure_id",
  conv_link."linked_by_user_id",
  conv_link."linked_at"
FROM "ai_create_tasks" AS create_task
JOIN "agent_tasks" AS task ON task."id" = create_task."id"
JOIN "conversation_task_links" AS conv_link ON conv_link."task_id" = task."id"
WHERE create_task."departure_id" IS NOT NULL
ON CONFLICT ("conversation_id", "departure_id") DO NOTHING;

ALTER TABLE "ai_review_packages" ADD COLUMN "item_identity" TEXT;
UPDATE "ai_review_packages" SET "item_identity" = "id" WHERE "item_identity" IS NULL;
ALTER TABLE "ai_review_packages" ALTER COLUMN "item_identity" SET DEFAULT 'item:0';
ALTER TABLE "ai_review_packages" ALTER COLUMN "item_identity" SET NOT NULL;

DROP INDEX IF EXISTS "ai_review_packages_proposal_identity_key";
CREATE UNIQUE INDEX "ai_review_packages_item_identity_key"
  ON "ai_review_packages"("input_batch_id", "item_identity");
CREATE INDEX "ai_review_packages_input_batch_id_proposal_hash_idx"
  ON "ai_review_packages"("input_batch_id", "proposal_hash");

ALTER TABLE "ai_review_records" ADD COLUMN "package_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_review_records" ADD COLUMN "before_snapshot" JSONB;
ALTER TABLE "ai_review_records" ADD COLUMN "after_snapshot" JSONB;

ALTER TABLE "ai_create_idempotency_records" ADD COLUMN "request_snapshot" JSONB;
ALTER TABLE "ai_create_idempotency_records" ADD COLUMN "operator_user_id" TEXT;
ALTER TABLE "ai_create_idempotency_records"
  ADD CONSTRAINT "ai_create_idempotency_records_operator_user_id_fkey"
  FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ai_create_idempotency_records_operator_user_id_idx"
  ON "ai_create_idempotency_records"("operator_user_id");

ALTER TABLE "ai_workflow_jobs" ADD COLUMN "review_package_id" TEXT;
ALTER TABLE "ai_workflow_jobs" ADD COLUMN "idempotency_record_id" TEXT;
ALTER TABLE "ai_workflow_jobs"
  ADD CONSTRAINT "ai_workflow_jobs_review_package_id_fkey"
  FOREIGN KEY ("review_package_id") REFERENCES "ai_review_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_jobs"
  ADD CONSTRAINT "ai_workflow_jobs_idempotency_record_id_fkey"
  FOREIGN KEY ("idempotency_record_id") REFERENCES "ai_create_idempotency_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ai_workflow_jobs_review_package_id_status_idx"
  ON "ai_workflow_jobs"("review_package_id", "status");
CREATE INDEX "ai_workflow_jobs_idempotency_record_id_idx"
  ON "ai_workflow_jobs"("idempotency_record_id");
