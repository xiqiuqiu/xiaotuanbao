-- CreateEnum
CREATE TYPE "ai_conversation_interaction_type" AS ENUM ('free_text', 'single_choice');

-- CreateEnum
CREATE TYPE "ai_conversation_interaction_status" AS ENUM ('pending', 'answered', 'cancelled');

-- AlterTable
ALTER TABLE "ai_input_batches" ADD COLUMN "reply_to_event_id" TEXT;

-- CreateTable
CREATE TABLE "ai_conversation_interactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" "ai_conversation_interaction_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "response_schema" JSONB NOT NULL,
    "status" "ai_conversation_interaction_status" NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "response_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_interactions_event_id_key" ON "ai_conversation_interactions"("event_id");

-- CreateIndex
CREATE INDEX "ai_conversation_interactions_conversation_id_status_idx" ON "ai_conversation_interactions"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "ai_conversation_interactions_organization_id_created_at_idx" ON "ai_conversation_interactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_input_batches_reply_to_event_id_idx" ON "ai_input_batches"("reply_to_event_id");

-- AddForeignKey
ALTER TABLE "ai_input_batches" ADD CONSTRAINT "ai_input_batches_reply_to_event_id_fkey" FOREIGN KEY ("reply_to_event_id") REFERENCES "ai_conversation_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_interactions" ADD CONSTRAINT "ai_conversation_interactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_interactions" ADD CONSTRAINT "ai_conversation_interactions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_interactions" ADD CONSTRAINT "ai_conversation_interactions_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_interactions" ADD CONSTRAINT "ai_conversation_interactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "ai_conversation_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
