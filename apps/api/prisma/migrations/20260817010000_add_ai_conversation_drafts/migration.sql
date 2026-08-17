CREATE TABLE "ai_conversation_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "draft_epoch" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_conversation_drafts_conversation_id_user_id_key"
ON "ai_conversation_drafts"("conversation_id", "user_id");

CREATE INDEX "ai_conversation_drafts_organization_id_user_id_updated_at_idx"
ON "ai_conversation_drafts"("organization_id", "user_id", "updated_at");

ALTER TABLE "ai_conversation_drafts"
ADD CONSTRAINT "ai_conversation_drafts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_drafts"
ADD CONSTRAINT "ai_conversation_drafts_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_drafts"
ADD CONSTRAINT "ai_conversation_drafts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
