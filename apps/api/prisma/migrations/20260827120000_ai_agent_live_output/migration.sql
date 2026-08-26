-- #415: non-audit live assistant snapshots, keyed by Attempt.
CREATE TABLE "ai_agent_live_outputs" (
    "attempt_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "input_batch_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "reasoning_text" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_live_outputs_pkey" PRIMARY KEY ("attempt_id")
);

CREATE INDEX "ai_agent_live_outputs_conversation_id_updated_at_idx" ON "ai_agent_live_outputs"("conversation_id", "updated_at");
CREATE INDEX "ai_agent_live_outputs_expires_at_idx" ON "ai_agent_live_outputs"("expires_at");
CREATE INDEX "ai_agent_live_outputs_organization_id_idx" ON "ai_agent_live_outputs"("organization_id");

ALTER TABLE "ai_agent_live_outputs" ADD CONSTRAINT "ai_agent_live_outputs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "ai_agent_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_live_outputs" ADD CONSTRAINT "ai_agent_live_outputs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_live_outputs" ADD CONSTRAINT "ai_agent_live_outputs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_agent_live_outputs" ADD CONSTRAINT "ai_agent_live_outputs_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
