-- #369: Conversation archive lifecycle is open / archived.
ALTER TYPE "ai_conversation_status" ADD VALUE IF NOT EXISTS 'archived';
