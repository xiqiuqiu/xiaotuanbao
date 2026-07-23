-- AlterTable
ALTER TABLE "itinerary_segments" ADD COLUMN "pending_check" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "segment_resources" ADD COLUMN "pending_check" BOOLEAN NOT NULL DEFAULT false;
