ALTER TABLE "ai_agent_attempts"
ADD COLUMN "agent_definition_key" TEXT NOT NULL DEFAULT 'departure.create',
ADD COLUMN "agent_definition_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "granted_capabilities" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "ai_actions"
ADD COLUMN "agent_definition_key" TEXT NOT NULL DEFAULT 'departure.create',
ADD COLUMN "agent_definition_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "capability_key" TEXT,
ADD COLUMN "capability_version" INTEGER;
