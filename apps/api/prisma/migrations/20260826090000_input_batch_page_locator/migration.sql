-- #371: freeze the validated current-page locator onto each InputBatch.
ALTER TABLE "ai_input_batches" ADD COLUMN "page_locator" JSONB;
