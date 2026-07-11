-- When guest schedules gained source-order ids, already-verified transactions
-- also need the same stable key. Only backfill an unambiguous single source;
-- ambiguous legacy transactions remain visible to finance-integrity-check.
WITH guest_transaction_sources AS (
  SELECT
    fv.transaction_id,
    MIN(ps.source_id) AS source_id
  FROM finance_verifications AS fv
  INNER JOIN payment_schedules AS ps
    ON ps.id = fv.payment_schedule_id
  WHERE ps.counterparty_type = 'guest'
    AND ps.source_type = 'source_order_guest_collection'
    AND ps.source_id IS NOT NULL
  GROUP BY fv.transaction_id
  HAVING COUNT(DISTINCT ps.source_id) = 1
)
UPDATE finance_transactions AS ft
SET counterparty_id = guest_transaction_sources.source_id
FROM guest_transaction_sources
WHERE ft.id = guest_transaction_sources.transaction_id
  AND ft.counterparty_type = 'guest'
  AND ft.counterparty_id IS NULL;
