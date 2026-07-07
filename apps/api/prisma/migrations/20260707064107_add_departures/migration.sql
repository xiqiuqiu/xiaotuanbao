-- CreateEnum
CREATE TYPE "departure_route_source" AS ENUM ('template', 'manual', 'copy');

-- CreateEnum
CREATE TYPE "departure_type" AS ENUM ('independent', 'combined');

-- CreateEnum
CREATE TYPE "departure_status" AS ENUM ('editing', 'pending_settlement', 'settled', 'closed');

-- CreateTable
CREATE TABLE "departures" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "departure_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "route_name" TEXT NOT NULL,
    "route_source" "departure_route_source" NOT NULL DEFAULT 'manual',
    "source_template_id" TEXT,
    "departure_type" "departure_type" NOT NULL DEFAULT 'combined',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "day_count" INTEGER NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "status" "departure_status" NOT NULL DEFAULT 'editing',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departures_organization_id_departure_no_key" ON "departures"("organization_id", "departure_no");

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
