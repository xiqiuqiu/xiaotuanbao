-- Extend resource_kind with members previously only on supplier_category.
-- Must commit before the next migration uses these values (PG enum rule).
ALTER TYPE "resource_kind" ADD VALUE 'scenic';
ALTER TYPE "resource_kind" ADD VALUE 'shop';
ALTER TYPE "resource_kind" ADD VALUE 'entertainment';
ALTER TYPE "resource_kind" ADD VALUE 'insurance';
