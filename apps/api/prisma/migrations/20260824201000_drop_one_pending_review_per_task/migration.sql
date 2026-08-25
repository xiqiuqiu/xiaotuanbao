-- #367: pending Review Packages are no longer unique per Task.
DROP INDEX IF EXISTS "ai_review_packages_one_pending_per_task";
