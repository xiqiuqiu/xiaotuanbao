-- #373: leftover ActivityRun rows must not block Review Package cleanup.
ALTER TABLE "ai_review_packages" DROP CONSTRAINT "ai_review_packages_run_id_fkey";
ALTER TABLE "ai_review_packages" ADD CONSTRAINT "ai_review_packages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_create_activity_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
