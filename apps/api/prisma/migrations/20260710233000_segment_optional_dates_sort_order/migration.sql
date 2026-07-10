-- AlterTable
ALTER TABLE "itinerary_segments" ADD COLUMN "sort_order" INTEGER;
ALTER TABLE "itinerary_segments" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "itinerary_segments" ALTER COLUMN "end_date" DROP NOT NULL;
ALTER TABLE "itinerary_segments" ALTER COLUMN "day_count" DROP NOT NULL;

-- Backfill sort_order by existing start_date order within each departure
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY departure_id
      ORDER BY start_date ASC NULLS LAST, id ASC
    ) - 1 AS rn
  FROM itinerary_segments
)
UPDATE itinerary_segments AS segment
SET sort_order = ordered.rn
FROM ordered
WHERE segment.id = ordered.id;

ALTER TABLE "itinerary_segments" ALTER COLUMN "sort_order" SET NOT NULL;
