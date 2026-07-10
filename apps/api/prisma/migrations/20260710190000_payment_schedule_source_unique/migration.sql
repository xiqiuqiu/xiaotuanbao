CREATE UNIQUE INDEX "payment_schedules_organization_id_direction_source_type_source_id_key"
ON "payment_schedules"("organization_id", "direction", "source_type", "source_id");
