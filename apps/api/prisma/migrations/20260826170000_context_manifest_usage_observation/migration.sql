-- #383: associate TokenLimiter processor version and provider usage with Context Manifest.
ALTER TABLE "ai_context_manifests"
ADD COLUMN "processor_version" TEXT,
ADD COLUMN "usage_source" "ai_usage_source" NOT NULL DEFAULT 'missing',
ADD COLUMN "usage" JSONB,
ADD COLUMN "step_usages" JSONB NOT NULL DEFAULT '[]';
