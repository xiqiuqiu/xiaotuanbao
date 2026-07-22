-- The product_features backfill skipped whitespace-only features_text and left
-- the column non-null. Clear those values so empty features stay paired with
-- null features_text (detail API / denormalized cache stay consistent).
UPDATE "products"
SET "features_text" = NULL
WHERE "features_text" IS NOT NULL AND btrim("features_text") = '';
