-- #373: Review Package no longer requires AiCreateActivityRun.
ALTER TABLE "ai_review_packages" ALTER COLUMN "run_id" DROP NOT NULL;
