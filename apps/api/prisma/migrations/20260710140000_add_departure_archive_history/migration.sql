-- CreateEnum
CREATE TYPE "departure_archive_action" AS ENUM ('archive', 'unarchive');

-- CreateTable
CREATE TABLE "departure_archive_histories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "action" "departure_archive_action" NOT NULL,
    "reason" TEXT NOT NULL,
    "operated_by" TEXT NOT NULL,
    "operated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departure_archive_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departure_archive_histories_departure_id_operated_at_idx" ON "departure_archive_histories"("departure_id", "operated_at");

-- CreateIndex
CREATE INDEX "departure_archive_histories_organization_id_departure_id_idx" ON "departure_archive_histories"("organization_id", "departure_id");

-- AddForeignKey
ALTER TABLE "departure_archive_histories" ADD CONSTRAINT "departure_archive_histories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_archive_histories" ADD CONSTRAINT "departure_archive_histories_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_archive_histories" ADD CONSTRAINT "departure_archive_histories_operated_by_fkey" FOREIGN KEY ("operated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
