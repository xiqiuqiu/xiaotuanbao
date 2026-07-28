-- CreateTable
CREATE TABLE "departure_resources" (
    "id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "resource_kind" "resource_kind" NOT NULL,
    "counterparty_type" "counterparty_type" NOT NULL,
    "partner_id" TEXT,
    "supplier_id" TEXT,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "pending_check" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_resources_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "departure_resources" ADD CONSTRAINT "departure_resources_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_resources" ADD CONSTRAINT "departure_resources_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_resources" ADD CONSTRAINT "departure_resources_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
