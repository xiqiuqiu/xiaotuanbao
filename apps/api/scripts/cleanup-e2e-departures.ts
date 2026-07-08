/**
 * 仅清理 E2E 测试残留发团（departureNo / name / routeName 以 e2e- 开头），
 * 不影响手动添加或其它演示数据。
 *
 * 用法：pnpm --filter api db:cleanup-e2e-departures
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const E2E_DEPARTURE_FILTER = {
  OR: [
    { departureNo: { startsWith: 'e2e-' } },
    { name: { startsWith: 'e2e-' } },
    { routeName: { startsWith: 'e2e-' } },
  ],
} as const

async function main() {
  const e2eDepartures = await prisma.departure.findMany({
    where: E2E_DEPARTURE_FILTER,
    select: { id: true, departureNo: true, name: true, routeName: true },
    orderBy: { createdAt: 'desc' },
  })

  if (e2eDepartures.length === 0) {
    console.log('No e2e departures to clean.')
    return
  }

  console.log(`Found ${e2eDepartures.length} e2e departures:`)
  for (const item of e2eDepartures) {
    console.log(`  - ${item.departureNo} | ${item.name} | ${item.routeName}`)
  }

  const departureIds = e2eDepartures.map((item) => item.id)

  await prisma.financeVerification.deleteMany({
    where: { paymentSchedule: { departureId: { in: departureIds } } },
  })
  await prisma.paymentSchedule.deleteMany({
    where: { departureId: { in: departureIds } },
  })
  await prisma.financeTransaction.deleteMany({
    where: { departureId: { in: departureIds } },
  })
  await prisma.departure.deleteMany({
    where: { id: { in: departureIds } },
  })

  const e2eTemplates = await prisma.routeTemplate.findMany({
    where: { name: { startsWith: 'e2e-' } },
    select: { id: true, name: true },
  })

  if (e2eTemplates.length > 0) {
    await prisma.routeTemplate.deleteMany({
      where: { id: { in: e2eTemplates.map((item) => item.id) } },
    })
    console.log(`Cleaned ${e2eTemplates.length} e2e route templates.`)
  }

  const remaining = await prisma.departure.count()
  console.log(`Done. Cleaned ${e2eDepartures.length} e2e departures. ${remaining} departures remain.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
