-- Guest collection schedules use source-order id as the stable counterparty key
-- so verification can match by id even when transaction display names differ.
UPDATE payment_schedules
SET counterparty_id = source_id
WHERE source_type = 'source_order_guest_collection'
  AND source_id IS NOT NULL
  AND (counterparty_id IS NULL OR counterparty_id <> source_id);
