-- CreateTable
CREATE TABLE "ai_action_repeat_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_repeat_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_actions_repeat_lookup_idx" ON "ai_actions"("organization_id", "name", "target_kind", "target_id", "input_hash");

-- CreateIndex
CREATE INDEX "ai_action_repeat_observations_fingerprint_created_at_idx" ON "ai_action_repeat_observations"("fingerprint", "created_at");

-- CreateIndex
CREATE INDEX "ai_action_repeat_observations_organization_id_created_at_idx" ON "ai_action_repeat_observations"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_action_repeat_observations" ADD CONSTRAINT "ai_action_repeat_observations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_repeat_observations" ADD CONSTRAINT "ai_action_repeat_observations_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ai_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
