-- AlterTable
ALTER TABLE "itinerary_segments" ADD COLUMN "full_ticket_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "itinerary_segments" ADD COLUMN "half_ticket_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "itinerary_segments" ADD COLUMN "student_ticket_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "itinerary_segments" ADD COLUMN "free_ticket_count" INTEGER NOT NULL DEFAULT 0;
