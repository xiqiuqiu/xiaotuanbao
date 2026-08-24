ALTER TABLE "ai_context_manifests"
  ADD COLUMN "task_refs" JSONB NOT NULL DEFAULT '[]';
