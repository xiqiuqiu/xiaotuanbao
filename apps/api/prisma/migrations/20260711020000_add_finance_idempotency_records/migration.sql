CREATE TABLE "finance_idempotency_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_json" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_idempotency_records_organization_id_operation_idempotency_key_key"
ON "finance_idempotency_records"("organization_id", "operation", "idempotency_key");

CREATE INDEX "finance_idempotency_records_organization_id_created_at_idx"
ON "finance_idempotency_records"("organization_id", "created_at");

ALTER TABLE "finance_idempotency_records"
ADD CONSTRAINT "finance_idempotency_records_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
