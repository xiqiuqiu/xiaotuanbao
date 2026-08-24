-- InputBatch task membership is represented only by input_batch_task_links.
DROP INDEX "ai_input_batches_task_id_status_idx";
ALTER TABLE "ai_input_batches" DROP CONSTRAINT "ai_input_batches_task_id_fkey";
ALTER TABLE "ai_input_batches" DROP COLUMN "task_id";
