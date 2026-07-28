CREATE TABLE "ground_incomes" (
    "id" TEXT NOT NULL,
    "departure_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ground_incomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ground_incomes_departure_id_created_at_idx"
ON "ground_incomes"("departure_id", "created_at");

ALTER TABLE "ground_incomes"
ADD CONSTRAINT "ground_incomes_departure_id_fkey"
FOREIGN KEY ("departure_id") REFERENCES "departures"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
