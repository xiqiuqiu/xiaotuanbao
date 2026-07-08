-- CreateEnum
CREATE TYPE "payment_channel" AS ENUM ('cash', 'bank_transfer', 'wechat', 'alipay', 'other');

-- AlterTable
ALTER TABLE "finance_transactions" ADD COLUMN "payment_channel" "payment_channel" NOT NULL DEFAULT 'other';
