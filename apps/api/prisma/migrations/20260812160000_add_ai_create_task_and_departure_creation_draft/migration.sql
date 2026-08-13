-- CreateEnum
CREATE TYPE "ai_create_task_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "ai_create_phase" AS ENUM ('basic_info');

-- CreateTable
CREATE TABLE "ai_create_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "status" "ai_create_task_status" NOT NULL DEFAULT 'in_progress',
    "current_phase" "ai_create_phase" NOT NULL DEFAULT 'basic_info',
    "departure_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_create_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_creation_drafts" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_creation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_create_idempotency_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_json" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_create_idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_create_tasks_departure_id_key" ON "ai_create_tasks"("departure_id");

-- CreateIndex
CREATE INDEX "ai_create_tasks_organization_id_creator_user_id_status_updat_idx" ON "ai_create_tasks"("organization_id", "creator_user_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "departure_creation_drafts_task_id_key" ON "departure_creation_drafts"("task_id");

-- CreateIndex
CREATE INDEX "ai_create_idempotency_records_task_id_idx" ON "ai_create_idempotency_records"("task_id");

-- CreateIndex
CREATE INDEX "ai_create_idempotency_records_organization_id_created_at_idx" ON "ai_create_idempotency_records"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_create_idempotency_records_organization_id_operation_idem_key" ON "ai_create_idempotency_records"("organization_id", "operation", "idempotency_key");

-- AddForeignKey
ALTER TABLE "ai_create_tasks" ADD CONSTRAINT "ai_create_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_tasks" ADD CONSTRAINT "ai_create_tasks_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_tasks" ADD CONSTRAINT "ai_create_tasks_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_creation_drafts" ADD CONSTRAINT "departure_creation_drafts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_idempotency_records" ADD CONSTRAINT "ai_create_idempotency_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_create_idempotency_records" ADD CONSTRAINT "ai_create_idempotency_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ai_create_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
