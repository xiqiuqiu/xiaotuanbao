/**
 * 清理 E2E 测试残留发团，并写入演示用模拟数据。
 *
 * 用法：pnpm --filter api exec dotenv -e ../../.env -- tsx scripts/reset-demo-departures.ts
 */
import {
  CounterpartyType,
  DepartureRouteSource,
  DepartureStatus,
  DepartureType,
  DirectoryProfileStatus,
  PrismaClient,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'

const prisma = new PrismaClient()

const E2E_DEPARTURE_FILTER = {
  OR: [
    { departureNo: { startsWith: 'e2e-' } },
    { name: { startsWith: 'e2e-' } },
    { routeName: { startsWith: 'e2e-' } },
  ],
} as const

async function cleanupE2eDepartures(organizationId: string) {
  const e2eDepartures = await prisma.departure.findMany({
    where: { organizationId, ...E2E_DEPARTURE_FILTER },
    select: { id: true, departureNo: true },
  })

  if (e2eDepartures.length === 0) {
    console.log('No e2e departures to clean.')
    return 0
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

  console.log(`Cleaned ${e2eDepartures.length} e2e departures.`)
  return e2eDepartures.length
}

async function cleanupPlaceholderDepartures(organizationId: string) {
  const placeholders = await prisma.departure.findMany({
    where: {
      organizationId,
      OR: [
        { routeName: { in: ['A线', '测试旅游8天的线路'] } },
        { name: { contains: '测试旅游' } },
      ],
    },
    select: { id: true, departureNo: true, name: true },
  })

  if (placeholders.length === 0) {
    return 0
  }

  const departureIds = placeholders.map((item) => item.id)

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

  console.log(`Cleaned ${placeholders.length} placeholder departures.`)
  return placeholders.length
}

async function cleanupE2eRouteTemplates(organizationId: string) {
  const templates = await prisma.routeTemplate.findMany({
    where: { organizationId, name: { startsWith: 'e2e-' } },
    select: { id: true },
  })

  if (templates.length === 0) {
    return 0
  }

  await prisma.routeTemplate.deleteMany({
    where: { id: { in: templates.map((item) => item.id) } },
  })

  console.log(`Cleaned ${templates.length} e2e route templates.`)
  return templates.length
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

async function seedDemoDepartures(
  organizationId: string,
  ownerUserId: string,
  supplierIds: { hotel: string; transport: string; scenic: string },
  partnerId: string,
) {
  const existingDemo = await prisma.departure.count({
    where: {
      organizationId,
      departureNo: { startsWith: 'XTB2026' },
      NOT: E2E_DEPARTURE_FILTER,
    },
  })

  if (existingDemo >= 5) {
    console.log(`Demo departures already present (${existingDemo}), skipping seed.`)
    return
  }

  const demoDepartures = [
    {
      departureNo: 'XTB202608150001',
      name: '喀纳斯阿勒泰10日线 8月15日团',
      routeName: '喀纳斯阿勒泰10日线',
      routeSource: DepartureRouteSource.template,
      departureType: DepartureType.combined,
      startDate: '2026-08-15',
      endDate: '2026-08-24',
      dayCount: 10,
      status: DepartureStatus.editing,
      notes: '华东国旅发客，需提前确认房态',
      segments: [
        {
          name: '乌鲁木齐集结',
          startDate: '2026-08-15',
          endDate: '2026-08-16',
          dayCount: 2,
          destination: '乌鲁木齐',
          resources: [
            {
              resourceKind: ResourceKind.hotel,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.hotel,
              title: '乌鲁木齐五星酒店',
              amountCents: 88000,
            },
          ],
        },
        {
          name: '喀纳斯湖区',
          startDate: '2026-08-17',
          endDate: '2026-08-20',
          dayCount: 4,
          destination: '喀纳斯',
          resources: [
            {
              resourceKind: ResourceKind.transport,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.transport,
              title: '区间用车 45 座',
              amountCents: 480000,
            },
            {
              resourceKind: ResourceKind.hotel,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.hotel,
              title: '喀纳斯景区酒店',
              amountCents: 120000,
            },
          ],
        },
        {
          name: '阿勒泰返程',
          startDate: '2026-08-21',
          endDate: '2026-08-24',
          dayCount: 4,
          destination: '阿勒泰',
          resources: [],
        },
      ],
      sourceOrder: {
        adultGuestCount: 32,
        childGuestCount: 0,
        adultUnitPriceCents: 458000,
        childUnitPriceCents: 0,
        collectionMode: SourceOrderCollectionMode.guest_only,
      },
    },
    {
      departureNo: 'XTB2026090001',
      name: '杭州西湖文化2日线 9月1日团',
      routeName: '杭州西湖文化2日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.independent,
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      dayCount: 2,
      status: DepartureStatus.editing,
      segments: [
        {
          name: '西湖环湖',
          startDate: '2026-09-01',
          endDate: '2026-09-01',
          dayCount: 1,
          destination: '西湖',
          resources: [
            {
              resourceKind: ResourceKind.scenic,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.scenic,
              title: '灵隐飞来峰团队票',
              amountCents: 4500,
            },
            {
              resourceKind: ResourceKind.meal,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.hotel,
              title: '楼外楼团队午餐',
              amountCents: 8000,
            },
          ],
        },
        {
          name: '宋城千古情',
          startDate: '2026-09-02',
          endDate: '2026-09-02',
          dayCount: 1,
          destination: '宋城',
          resources: [
            {
              resourceKind: ResourceKind.scenic,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.scenic,
              title: '千古情团队票',
              amountCents: 28000,
            },
          ],
        },
      ],
    },
    {
      departureNo: 'XTB2026090002',
      name: '黄山徽州3日线 9月10日团',
      routeName: '黄山徽州3日线',
      routeSource: DepartureRouteSource.copy,
      departureType: DepartureType.combined,
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      dayCount: 3,
      status: DepartureStatus.pending_settlement,
      notes: '复制自发团模板，已出团待结清',
      segments: [
        {
          name: '黄山登山',
          startDate: '2026-09-10',
          endDate: '2026-09-11',
          dayCount: 2,
          destination: '黄山',
          resources: [
            {
              resourceKind: ResourceKind.hotel,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.hotel,
              title: '黄山迎客松酒店',
              amountCents: 52000,
            },
          ],
        },
        {
          name: '宏村徽州',
          startDate: '2026-09-12',
          endDate: '2026-09-12',
          dayCount: 1,
          destination: '宏村',
          resources: [],
        },
      ],
      sourceOrder: {
        adultGuestCount: 18,
        childGuestCount: 0,
        adultUnitPriceCents: 128000,
        childUnitPriceCents: 0,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      },
    },
    {
      departureNo: 'XTB2026070001',
      name: '千岛湖休闲1日线 7月20日团',
      routeName: '千岛湖休闲1日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.independent,
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      dayCount: 1,
      status: DepartureStatus.closed,
      notes: '已结清关闭',
      segments: [
        {
          name: '千岛湖游船',
          startDate: '2026-07-20',
          endDate: '2026-07-20',
          dayCount: 1,
          destination: '千岛湖',
          resources: [
            {
              resourceKind: ResourceKind.scenic,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.scenic,
              title: '中心湖区船票联票',
              amountCents: 15000,
            },
          ],
        },
      ],
    },
    {
      departureNo: 'XTB2026100001',
      name: '乌镇西栅2日线 10月1日团',
      routeName: '乌镇西栅2日线',
      routeSource: DepartureRouteSource.manual,
      departureType: DepartureType.combined,
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      dayCount: 2,
      status: DepartureStatus.editing,
      segments: [
        {
          name: '西栅夜游',
          startDate: '2026-10-01',
          endDate: '2026-10-01',
          dayCount: 1,
          destination: '乌镇西栅',
          resources: [],
        },
        {
          name: '东栅文化',
          startDate: '2026-10-02',
          endDate: '2026-10-02',
          dayCount: 1,
          destination: '乌镇东栅',
          resources: [],
        },
      ],
    },
  ] as const

  for (const demo of demoDepartures) {
    const exists = await prisma.departure.findFirst({
      where: { organizationId, departureNo: demo.departureNo },
    })
    if (exists) {
      continue
    }

    const { segments, sourceOrder, ...departureData } = demo

    const departure = await prisma.departure.create({
      data: {
        organizationId,
        ownerUserId,
        ...departureData,
        startDate: parseDate(departureData.startDate),
        endDate: parseDate(departureData.endDate),
        itinerarySegments: {
          create: segments.map((segment) => ({
            name: segment.name,
            startDate: parseDate(segment.startDate),
            endDate: parseDate(segment.endDate),
            dayCount: segment.dayCount,
            destination: segment.destination,
            resources: {
              create: segment.resources.map((resource) => ({
                resourceKind: resource.resourceKind,
                counterpartyType: resource.counterpartyType,
                supplierId: resource.supplierId,
                title: resource.title,
                amountCents: resource.amountCents,
              })),
            },
          })),
        },
      },
    })

    if (sourceOrder) {
      const guestCount = sourceOrder.adultGuestCount + sourceOrder.childGuestCount
      const grossReceivableCents =
        sourceOrder.adultGuestCount * sourceOrder.adultUnitPriceCents +
        sourceOrder.childGuestCount * sourceOrder.childUnitPriceCents
      const partnerCollectedCents =
        sourceOrder.collectionMode === SourceOrderCollectionMode.partner_settled
          ? grossReceivableCents
          : 0
      const guestCollectCents =
        sourceOrder.collectionMode === SourceOrderCollectionMode.guest_only
          ? grossReceivableCents
          : grossReceivableCents - partnerCollectedCents

      await prisma.sourceOrder.create({
        data: {
          departureId: departure.id,
          partnerId,
          displayName: `${demo.routeName} 客源单`,
          guestCount,
          adultGuestCount: sourceOrder.adultGuestCount,
          childGuestCount: sourceOrder.childGuestCount,
          adultUnitPriceCents: sourceOrder.adultUnitPriceCents,
          childUnitPriceCents: sourceOrder.childUnitPriceCents,
          grossReceivableCents,
          discountType: SourceOrderDiscountType.none,
          discountCents: 0,
          netReceivableCents: grossReceivableCents,
          collectionMode: sourceOrder.collectionMode,
          partnerCollectedCents,
          guestCollectCents,
        },
      })
    }

    console.log(`Seeded departure ${demo.departureNo} — ${demo.name}`)
  }

  const routeTemplates = [
    {
      name: '喀纳斯阿勒泰10日线',
      defaultDayCount: 10,
      usageCount: 3,
      segments: [
        {
          sortOrder: 0,
          name: '乌鲁木齐集结',
          dayCount: 2,
          destination: '乌鲁木齐',
          resources: [
            {
              resourceKind: ResourceKind.hotel,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.hotel,
              title: '乌鲁木齐五星酒店',
              amountCents: 88000,
            },
          ],
        },
        {
          sortOrder: 1,
          name: '喀纳斯湖区',
          dayCount: 4,
          destination: '喀纳斯',
          resources: [
            {
              resourceKind: ResourceKind.transport,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.transport,
              title: '区间用车 45 座',
              amountCents: 480000,
            },
          ],
        },
        {
          sortOrder: 2,
          name: '阿勒泰返程',
          dayCount: 4,
          destination: '阿勒泰',
          resources: [],
        },
      ],
    },
    {
      name: '杭州西湖文化2日线',
      defaultDayCount: 2,
      usageCount: 1,
      segments: [
        {
          sortOrder: 0,
          name: '西湖环湖',
          dayCount: 1,
          destination: '西湖',
          resources: [
            {
              resourceKind: ResourceKind.scenic,
              counterpartyType: CounterpartyType.supplier,
              supplierId: supplierIds.scenic,
              title: '灵隐飞来峰团队票',
              amountCents: 4500,
            },
          ],
        },
        {
          sortOrder: 1,
          name: '宋城千古情',
          dayCount: 1,
          destination: '宋城',
          resources: [],
        },
      ],
    },
  ] as const

  for (const template of routeTemplates) {
    const existing = await prisma.routeTemplate.findFirst({
      where: { organizationId, name: template.name },
    })
    if (existing) {
      continue
    }

    await prisma.routeTemplate.create({
      data: {
        organizationId,
        name: template.name,
        defaultDayCount: template.defaultDayCount,
        usageCount: template.usageCount,
        segments: {
          create: template.segments.map((segment) => ({
            sortOrder: segment.sortOrder,
            name: segment.name,
            dayCount: segment.dayCount,
            destination: segment.destination,
            resources: {
              create: segment.resources.map((resource) => ({
                resourceKind: resource.resourceKind,
                counterpartyType: resource.counterpartyType,
                supplierId: resource.supplierId,
                title: resource.title,
                amountCents: resource.amountCents,
              })),
            },
          })),
        },
      },
    })

    console.log(`Seeded route template "${template.name}"`)
  }
}

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? '演示旅行社'
  const organization = await prisma.organization.findFirst({
    where: { name: orgName, deletedAt: null },
  })

  if (!organization) {
    throw new Error(`Organization "${orgName}" not found. Run pnpm db:seed first.`)
  }

  const owner = await prisma.user.findFirst({
    where: { organizationId: organization.id, username: 'wangjie', deletedAt: null },
  })
  if (!owner) {
    throw new Error('Demo user wangjie not found.')
  }

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: organization.id, status: DirectoryProfileStatus.active },
    select: { id: true, name: true, categories: true },
  })

  const hotel = suppliers.find((item) => item.name.includes('国宾馆') || item.categories.includes('hotel'))
  const transport = suppliers.find((item) => item.categories.includes('transport'))
  const scenic = suppliers.find((item) => item.categories.includes('scenic'))

  if (!hotel || !transport || !scenic) {
    throw new Error('Required demo suppliers not found.')
  }

  const partner = await prisma.partner.findFirst({
    where: { organizationId: organization.id, status: DirectoryProfileStatus.active },
  })
  if (!partner) {
    throw new Error('Demo partner not found.')
  }

  await cleanupE2eDepartures(organization.id)
  await cleanupPlaceholderDepartures(organization.id)
  await cleanupE2eRouteTemplates(organization.id)

  await seedDemoDepartures(organization.id, owner.id, {
    hotel: hotel.id,
    transport: transport.id,
    scenic: scenic.id,
  }, partner.id)

  const remaining = await prisma.departure.count({ where: { organizationId: organization.id } })
  console.log(`Done. ${remaining} departures in database.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
