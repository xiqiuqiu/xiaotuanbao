-- AlterTable: persist 定金/尾款 installments; backfill from legacy P/G split.
ALTER TABLE "source_orders" ADD COLUMN "deposit_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "source_orders" ADD COLUMN "balance_cents" INTEGER NOT NULL DEFAULT 0;

UPDATE "source_orders"
SET
  "deposit_cents" = CASE
    WHEN "collection_mode" = 'split' THEN "partner_collected_cents"
    ELSE 0
  END,
  "balance_cents" = CASE
    WHEN "collection_mode" = 'guest_only' THEN "guest_collect_cents"
    WHEN "collection_mode" = 'split' THEN "guest_collect_cents"
    ELSE 0
  END;
