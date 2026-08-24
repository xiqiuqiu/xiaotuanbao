-- AiCreateTask is a shared-ID domain extension; lifecycle timestamps belong to AgentTask.
ALTER TABLE "ai_create_tasks"
  DROP COLUMN "created_at",
  DROP COLUMN "updated_at";
