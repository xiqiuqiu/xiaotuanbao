-- Remove CounterpartyType.manual: delete residual rows, then drop the enum value.

-- Verifications linked to manual schedules or transactions
DELETE FROM finance_verifications
WHERE payment_schedule_id IN (
  SELECT id FROM payment_schedules WHERE counterparty_type = 'manual'
)
OR transaction_id IN (
  SELECT id FROM finance_transactions WHERE counterparty_type = 'manual'
);

-- Settlement histories that point at manual schedules
DELETE FROM departure_settlement_histories
WHERE trigger_payment_schedule_id IN (
  SELECT id FROM payment_schedules WHERE counterparty_type = 'manual'
);

-- Activities cascade from payment_schedules; delete schedules after dependents above
DELETE FROM payment_schedules WHERE counterparty_type = 'manual';
DELETE FROM finance_transactions WHERE counterparty_type = 'manual';

-- Template / segment resources should not use manual; clear any leftover
DELETE FROM route_template_resources WHERE counterparty_type = 'manual';
DELETE FROM segment_resources WHERE counterparty_type = 'manual';

-- Recreate enum without `manual`
ALTER TYPE "counterparty_type" RENAME TO "counterparty_type_old";
CREATE TYPE "counterparty_type" AS ENUM ('partner', 'supplier', 'guest');

ALTER TABLE "payment_schedules"
  ALTER COLUMN "counterparty_type" TYPE "counterparty_type"
  USING ("counterparty_type"::text::"counterparty_type");

ALTER TABLE "finance_transactions"
  ALTER COLUMN "counterparty_type" TYPE "counterparty_type"
  USING ("counterparty_type"::text::"counterparty_type");

ALTER TABLE "route_template_resources"
  ALTER COLUMN "counterparty_type" TYPE "counterparty_type"
  USING ("counterparty_type"::text::"counterparty_type");

ALTER TABLE "segment_resources"
  ALTER COLUMN "counterparty_type" TYPE "counterparty_type"
  USING ("counterparty_type"::text::"counterparty_type");

DROP TYPE "counterparty_type_old";
