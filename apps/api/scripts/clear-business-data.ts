/**
 * 清空发团单与财务业务数据，保留供应商、合作伙伴及系统账号。
 *
 * 删除范围：
 * - 核销、收付款节点、财务流水
 * - 发团及其客源单、行程段、资源
 * - 线路模板
 * - 发团/财务类单据编号序列
 *
 * 用法：pnpm --filter api db:clear-business-data
 */
import { PrismaClient } from '@prisma/client'
import { clearBusinessData, countBusinessData } from './business-data-utils'

const prisma = new PrismaClient()

async function main() {
  const before = await countBusinessData(prisma)
  console.log('Before:', before)

  const deleted = await clearBusinessData(prisma)
  console.log('Deleted:', deleted)

  const after = await countBusinessData(prisma)
  console.log('After:', after)
  console.log('Done. Suppliers and partners preserved.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
