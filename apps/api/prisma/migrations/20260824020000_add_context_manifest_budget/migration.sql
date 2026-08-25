ALTER TABLE "ai_context_manifests"
ADD COLUMN "budget" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "sections" JSONB NOT NULL DEFAULT '[]';
