-- Supplier categories: single SupplierCategory → non-empty ResourceKind[].
ALTER TABLE "suppliers" ADD COLUMN "categories" "resource_kind"[];

-- Map legacy single category → ResourceKind set (restaurant → meal).
UPDATE "suppliers"
SET "categories" = ARRAY[
  CASE "category"::text
    WHEN 'restaurant' THEN 'meal'::"resource_kind"
    ELSE "category"::text::"resource_kind"
  END
];

ALTER TABLE "suppliers" ALTER COLUMN "categories" SET NOT NULL;

ALTER TABLE "suppliers" DROP COLUMN "category";

DROP TYPE "supplier_category";
