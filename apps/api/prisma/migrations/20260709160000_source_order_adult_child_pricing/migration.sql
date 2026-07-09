-- Add adult/child count and unit price columns (nullable during backfill)
ALTER TABLE "source_orders" ADD COLUMN "adult_guest_count" INTEGER;
ALTER TABLE "source_orders" ADD COLUMN "child_guest_count" INTEGER;
ALTER TABLE "source_orders" ADD COLUMN "adult_unit_price_cents" INTEGER;
ALTER TABLE "source_orders" ADD COLUMN "child_unit_price_cents" INTEGER;

-- Historical rows: all guests as adults; child count/price = 0
UPDATE "source_orders"
SET
  "adult_guest_count" = "guest_count",
  "child_guest_count" = 0,
  "adult_unit_price_cents" = "unit_price_cents",
  "child_unit_price_cents" = 0;

ALTER TABLE "source_orders" ALTER COLUMN "adult_guest_count" SET NOT NULL;
ALTER TABLE "source_orders" ALTER COLUMN "child_guest_count" SET NOT NULL;
ALTER TABLE "source_orders" ALTER COLUMN "adult_unit_price_cents" SET NOT NULL;
ALTER TABLE "source_orders" ALTER COLUMN "child_unit_price_cents" SET NOT NULL;

-- Drop legacy single unit price
ALTER TABLE "source_orders" DROP COLUMN "unit_price_cents";
