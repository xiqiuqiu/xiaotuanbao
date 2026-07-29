-- Destructive replace of fare_adjustment_kind for ADR-0035 six-kind catalog.
-- Dev stage: drop historical adjustment rows; no old-kind backfill.
DELETE FROM "source_order_fare_adjustments";

ALTER TABLE "source_order_fare_adjustments"
  ALTER COLUMN "kind" TYPE TEXT;

DROP TYPE "fare_adjustment_kind";

CREATE TYPE "fare_adjustment_kind" AS ENUM (
  'child_ticket_topup',
  'single_room_topup',
  'extended_stay',
  'ticket_discount_refund',
  'lodging_deduction',
  'other'
);

ALTER TABLE "source_order_fare_adjustments"
  ALTER COLUMN "kind" TYPE "fare_adjustment_kind"
  USING ("kind"::"fare_adjustment_kind");
