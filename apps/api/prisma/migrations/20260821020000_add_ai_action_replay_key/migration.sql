-- AlterTable
ALTER TABLE "ai_actions" ADD COLUMN "replay_key" TEXT;

UPDATE "ai_actions" SET "replay_key" = "id" WHERE "replay_key" IS NULL;

ALTER TABLE "ai_actions" ALTER COLUMN "replay_key" SET NOT NULL;

CREATE UNIQUE INDEX "ai_actions_replay_key_key" ON "ai_actions"("replay_key");
