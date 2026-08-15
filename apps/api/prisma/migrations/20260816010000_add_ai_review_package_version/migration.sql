-- AlterTable
ALTER TABLE "ai_review_packages" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ai_review_packages" ADD COLUMN "input_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_review_packages_input_batch_id_idx" ON "ai_review_packages"("input_batch_id");

-- AddForeignKey
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_input_batch_id_fkey" FOREIGN KEY ("input_batch_id") REFERENCES "ai_input_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
