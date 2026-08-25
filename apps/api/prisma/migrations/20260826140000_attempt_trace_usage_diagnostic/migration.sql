-- #372: persist recoverable Attempt diagnostics independently of Mastra traces.
CREATE TYPE "ai_usage_source" AS ENUM ('missing', 'estimated', 'actual');

ALTER TABLE "ai_agent_attempts"
ADD COLUMN "mastra_trace_id" TEXT,
ADD COLUMN "usage_source" "ai_usage_source" NOT NULL DEFAULT 'missing',
ADD COLUMN "usage" JSONB,
ADD COLUMN "latency_ms" INTEGER,
ADD COLUMN "tool_steps" JSONB NOT NULL DEFAULT '[]';
