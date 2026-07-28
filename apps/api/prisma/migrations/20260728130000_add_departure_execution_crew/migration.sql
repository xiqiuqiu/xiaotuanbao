-- AlterTable
ALTER TABLE "departures"
ADD COLUMN "driver_supplier_id" TEXT,
ADD COLUMN "guide_supplier_id" TEXT,
ADD COLUMN "vehicle_plate" TEXT;

-- AddForeignKey
ALTER TABLE "departures"
ADD CONSTRAINT "departures_driver_supplier_id_fkey"
FOREIGN KEY ("driver_supplier_id") REFERENCES "suppliers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures"
ADD CONSTRAINT "departures_guide_supplier_id_fkey"
FOREIGN KEY ("guide_supplier_id") REFERENCES "suppliers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
