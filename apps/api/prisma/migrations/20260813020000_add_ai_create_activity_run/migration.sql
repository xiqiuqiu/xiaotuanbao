-- CreateEnum
CREATE TYPE "ai_create_activity_run_status" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ai_create_activity_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "status" "ai_create_activity_run_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "error_code" TEXT,

    CONSTRAINT "ai_create_activity_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_create_activity_runs_task_id_status_idx" ON "ai_create_activity_runs"("task_id", "status");

-- CreateIndex
CREATE INDEX "ai_create_activity_runs_organization_id_started_at_idx" ON "ai_create_activity_runs"("organization_id", "started_at");

-- AddForeignKey
ALTER TABLE "ai_create_activity_runs" ADD CONSTRAINT "ai_create_activity_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_activity_runs" ADD CONSTRAINT "ai_create_activity_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_activity_runs" ADD CONSTRAINT "ai_create_activity_runs_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
