CREATE TYPE "organization_status" AS ENUM ('enabled', 'disabled');

ALTER TABLE "organizations"
ADD COLUMN "status" "organization_status" NOT NULL DEFAULT 'enabled';
