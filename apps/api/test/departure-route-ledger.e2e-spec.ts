import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

/**
 * #183 线路账本主干 + #184 日/团拼出汇总 + #185 扫读抛光字段：
 * GET /departures/route-ledger — 精确 routeName + 可选出团日区间 → 日块 → 发团组 → 客源行；
 * 拼出挂在日/发团汇总，不进客源行；客源行含游客代表与拼入单价（算式输入）。
 */
describe('Departure route ledger API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let outsourceSupplierAId: string
  let outsourceSupplierBId: string
  let hotelSupplierId: string
  const testPrefix = `e2e-route-ledger-${Date.now()}`
  const routeName = `${testPrefix}-伊犁环线`
  const otherRouteName = `${testPrefix}-阿勒泰拼车`

  // Fixtures（本组织）：
  // D-early  出团 2026-07-10：早于同日多团日，用于日期正序
  // D-same-a / D-same-b  同日出团 2026-07-15：验证发团嵌套不打平；same-a 含多拼出
  // D-late   出团 2026-07-20：字段映射样例（含优惠与收款拆分）+ 单拼出 + 自营酒店干扰
  // D-other-route：近似路线名，精确匹配时不得混入
  // D-aug：出团 2026-08-05，日期区间过滤时排除
  let departureEarly: { id: string; departureNo: string }
  let departureSameA: { id: string; departureNo: string }
  let departureSameB: { id: string; departureNo: string }
  let departureLate: { id: string; departureNo: string }
  let orderLateId: string
  let lateOutsourceId: string
  let earlyPartnerOutsourceId: string
  let sameAOutsourceIds: string[]

  async function createDeparture(name: string, route: string, startDate: string, endDate: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name,
        routeName: route,
        startDate,
        endDate,
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string; departureNo: string }
  }

  async function createOrder(
    departureId: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send(payload)
      .expect(201)
    return response.body.data.id as string
  }

  async function createSegment(departureId: string, name: string, sortOrder: number) {
    const segment = await prisma.itinerarySegment.create({
      data: { departureId, name, sortOrder },
    })
    return segment.id
  }

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id

    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const supplierA = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-伊犁拼出社`,
        categories: [ResourceKind.outsource],
        status: DirectoryProfileStatus.active,
      },
    })
    outsourceSupplierAId = supplierA.id

    const supplierB = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-那拉提拼出社`,
        categories: [ResourceKind.outsource],
        status: DirectoryProfileStatus.active,
      },
    })
    outsourceSupplierBId = supplierB.id

    const hotelSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-自营酒店`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    hotelSupplierId = hotelSupplier.id

    departureEarly = await createDeparture(`${testPrefix}-early`, routeName, '2026-07-10', '2026-07-14')
    departureSameA = await createDeparture(`${testPrefix}-same-a`, routeName, '2026-07-15', '2026-07-19')
    departureSameB = await createDeparture(`${testPrefix}-same-b`, routeName, '2026-07-15', '2026-07-19')
    departureLate = await createDeparture(`${testPrefix}-late`, routeName, '2026-07-20', '2026-07-24')
    await createDeparture(`${testPrefix}-other-route`, otherRouteName, '2026-07-15', '2026-07-19')
    await createDeparture(`${testPrefix}-aug`, routeName, '2026-08-05', '2026-08-09')

    await createOrder(departureEarly.id, {
      partnerId,
      adultGuestCount: 1,
      childGuestCount: 0,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.partner_settled,
    })
    await createOrder(departureSameA.id, {
      partnerId,
      adultGuestCount: 2,
      childGuestCount: 0,
      adultUnitPriceCents: 90000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.partner_settled,
      notes: '同日团 A',
    })
    await createOrder(departureSameB.id, {
      partnerId,
      adultGuestCount: 3,
      childGuestCount: 0,
      adultUnitPriceCents: 80000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.partner_settled,
      notes: '同日团 B',
    })
    orderLateId = await createOrder(departureLate.id, {
      partnerId,
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 50000,
      discountType: SourceOrderDiscountType.lump_sum,
      discountCents: 30000,
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 120000,
      notes: '窗口位',
    })
    // #185：两条客人名单，最早一条为游客代表；同日团 A 不建名单 → 代表字段为空
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${orderLateId}/guests`)
      .send({ name: '陈志明', phone: '13800002211' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${orderLateId}/guests`)
      .send({ name: '林晓芳', phone: '13900008876' })
      .expect(201)

    // #184：单拼出（late）+ 自营酒店干扰；多拼出（same-a）；same-b 无拼出；
    // early 含历史 Partner 承接拼出（读路径兼容）。
    const earlySegmentId = await createSegment(departureEarly.id, '第一段', 0)
    const earlyPartnerOutsource = await prisma.segmentResource.create({
      data: {
        segmentId: earlySegmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.partner,
        partnerId,
        title: '历史 Partner 拼出',
        amountCents: 45000,
      },
    })
    earlyPartnerOutsourceId = earlyPartnerOutsource.id

    const lateSegmentId = await createSegment(departureLate.id, '第一段', 0)
    const lateOutsource = await prisma.segmentResource.create({
      data: {
        segmentId: lateSegmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.supplier,
        supplierId: outsourceSupplierAId,
        title: '伊犁整段拼出',
        amountCents: 150000,
      },
    })
    lateOutsourceId = lateOutsource.id
    await prisma.segmentResource.create({
      data: {
        segmentId: lateSegmentId,
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.supplier,
        supplierId: hotelSupplierId,
        title: '自营双床房',
        amountCents: 999900,
      },
    })

    const sameASegmentId = await createSegment(departureSameA.id, '第一段', 0)
    const sameAFirst = await prisma.segmentResource.create({
      data: {
        segmentId: sameASegmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.supplier,
        supplierId: outsourceSupplierAId,
        title: '伊犁段拼出',
        amountCents: 80000,
      },
    })
    const sameASecond = await prisma.segmentResource.create({
      data: {
        segmentId: sameASegmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.supplier,
        supplierId: outsourceSupplierBId,
        title: '那拉提段拼出',
        amountCents: 120000,
      },
    })
    sameAOutsourceIds = [sameAFirst.id, sameASecond.id]
  })

  afterAll(async () => {
    await prisma.segmentResource.deleteMany({
      where: {
        segment: { departure: { organizationId, name: { startsWith: testPrefix } } },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: { sourceOrder: { departure: { organizationId, name: { startsWith: testPrefix } } } },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('rejects missing routeName', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .expect(400)

    expect(response.body.message).toEqual(expect.any(String))
  })

  it('rejects users without /departure menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无发团权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const response = await authRequest(app, token)
      .get('/api/departures/route-ledger')
      .query({ routeName })
      .expect(403)

    expect(response.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role to read route ledger', async () => {
    await authRequest(app, financeToken)
      .get('/api/departures/route-ledger')
      .query({ routeName })
      .expect(200)
  })

  it('matches exact routeName only and nests date → departure → source order', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName })
      .expect(200)

    const data = response.body.data
    expect(data.routeName).toBe(routeName)
    expect(data.dateBlocks.map((block: { startDate: string }) => block.startDate)).toEqual([
      '2026-07-10',
      '2026-07-15',
      '2026-07-20',
      '2026-08-05',
    ])

    const sameDay = data.dateBlocks[1]
    expect(sameDay.departures).toHaveLength(2)
    expect(sameDay.departures.map((d: { departureId: string }) => d.departureId).sort()).toEqual(
      [departureSameA.id, departureSameB.id].sort(),
    )
    for (const group of sameDay.departures) {
      expect(group.sourceOrders).toHaveLength(1)
      expect(group.sourceOrders[0].notes).toMatch(/^同日团 /)
    }

    // 不得把客源行打平到日期块顶层；不得混入近似路线名
    expect(sameDay.sourceOrders).toBeUndefined()
    expect(JSON.stringify(data)).not.toContain(otherRouteName)
  })

  it('maps source-order money fields with system names and day/departure totals', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName, startDateFrom: '2026-07-20', startDateTo: '2026-07-20' })
      .expect(200)

    const data = response.body.data
    expect(data.dateBlocks).toHaveLength(1)
    const block = data.dateBlocks[0]
    expect(block.startDate).toBe('2026-07-20')
    expect(block.departures).toHaveLength(1)
    expect(block.departures[0].departureId).toBe(departureLate.id)
    expect(block.departures[0].departureNo).toBe(departureLate.departureNo)

    const row = block.departures[0].sourceOrders[0]
    expect(row).toMatchObject({
      id: orderLateId,
      departureId: departureLate.id,
      partnerId,
      partnerName: `${testPrefix}-华东国旅`,
      adultGuestCount: 2,
      childGuestCount: 1,
      guestCount: 3,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 50000,
      guestRepresentativeName: '陈志明',
      guestRepresentativePhone: '13800002211',
      grossReceivableCents: 250000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
      notes: '窗口位',
    })
    // 拼入单价仅作算式输入，权威合计仍走已存 gross/net，不另造算式合计字段
    expect(row).not.toHaveProperty('inboundPriceFormula')
    expect(row).not.toHaveProperty('inboundPriceFormulaCents')
    expect(row.adultUnitPriceCents * row.adultGuestCount + row.childUnitPriceCents * row.childGuestCount).toBe(
      row.grossReceivableCents,
    )

    // 不混核销已收/未收；无行级「实收业务」
    expect(row).not.toHaveProperty('settledAmountCents')
    expect(row).not.toHaveProperty('unsettledAmountCents')
    expect(row).not.toHaveProperty('verifiedReceivedCents')
    expect(row).not.toHaveProperty('businessNetCents')
    expect(JSON.stringify(row)).not.toMatch(/实收业务/)

    expect(block.departures[0].totals).toMatchObject({
      orderCount: 1,
      guestCount: 3,
      grossReceivableCents: 250000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
    })
    expect(block.totals).toMatchObject({
      orderCount: 1,
      guestCount: 3,
      grossReceivableCents: 250000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
    })
  })

  it('uses earliest guest as representative and leaves empty list null (#185)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName, startDateFrom: '2026-07-15', startDateTo: '2026-07-15' })
      .expect(200)

    const block = response.body.data.dateBlocks[0]
    const groupA = block.departures.find(
      (d: { departureId: string }) => d.departureId === departureSameA.id,
    )
    const row = groupA.sourceOrders[0]
    expect(row).toMatchObject({
      guestRepresentativeName: null,
      guestRepresentativePhone: null,
      adultUnitPriceCents: 90000,
      childUnitPriceCents: 0,
      adultGuestCount: 2,
      childGuestCount: 0,
    })
  })

  it('filters by optional startDate range on departure startDate', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({
        routeName,
        startDateFrom: '2026-07-10',
        startDateTo: '2026-07-15',
      })
      .expect(200)

    expect(response.body.data.dateBlocks.map((b: { startDate: string }) => b.startDate)).toEqual([
      '2026-07-10',
      '2026-07-15',
    ])
  })

  it('does not leak another organization departures with the same routeName', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-o`),
      },
    })
    const foreignOwner = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-foreign`,
        passwordHash: 'unused',
        name: '外组织',
      },
    })
    const foreignDeparture = await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        departureNo: `${otherOrg.businessPrefix}2026079999`,
        name: `${testPrefix}-foreign-dep`,
        routeName,
        startDate: new Date('2026-07-15T00:00:00.000Z'),
        endDate: new Date('2026-07-19T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId: foreignOwner.id,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName })
      .expect(200)

    const departureIds = response.body.data.dateBlocks.flatMap(
      (block: { departures: Array<{ departureId: string }> }) =>
        block.departures.map((d) => d.departureId),
    )
    expect(departureIds).not.toContain(foreignDeparture.id)

    await prisma.departure.delete({ where: { id: foreignDeparture.id } })
    await prisma.user.delete({ where: { id: foreignOwner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('summarizes single outsource on day/departure and excludes self-operated resources', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName, startDateFrom: '2026-07-20', startDateTo: '2026-07-20' })
      .expect(200)

    const block = response.body.data.dateBlocks[0]
    const group = block.departures[0]
    const expectedLine = {
      id: lateOutsourceId,
      supplierName: `${testPrefix}-伊犁拼出社`,
      amountCents: 150000,
      title: '伊犁整段拼出',
    }

    expect(group.outsource).toMatchObject({
      totalAmountCents: 150000,
      items: [expectedLine],
    })
    expect(block.outsource).toMatchObject({
      totalAmountCents: 150000,
      items: [expectedLine],
    })

    // 自营酒店不得进入拼出汇总
    expect(JSON.stringify(group.outsource)).not.toContain(`${testPrefix}-自营酒店`)
    expect(JSON.stringify(group.outsource)).not.toContain('999900')

    for (const row of group.sourceOrders) {
      expect(row).not.toHaveProperty('outsource')
      expect(row).not.toHaveProperty('outsourceAmountCents')
      expect(row).not.toHaveProperty('outsourceTotalCents')
      expect(row).not.toHaveProperty('outsourceSupplierName')
    }
  })

  it('resolves historical partner-backed outsource supplierName on day/departure summary', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName, startDateFrom: '2026-07-10', startDateTo: '2026-07-10' })
      .expect(200)

    const block = response.body.data.dateBlocks[0]
    const group = block.departures[0]
    const expectedLine = {
      id: earlyPartnerOutsourceId,
      supplierName: `${testPrefix}-华东国旅`,
      amountCents: 45000,
      title: '历史 Partner 拼出',
    }

    expect(group.outsource).toMatchObject({
      totalAmountCents: 45000,
      items: [expectedLine],
    })
    expect(block.outsource).toMatchObject({
      totalAmountCents: 45000,
      items: [expectedLine],
    })
  })

  it('lists multiple outsources on day/departure summary without source-order outsource fields', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/route-ledger')
      .query({ routeName, startDateFrom: '2026-07-15', startDateTo: '2026-07-15' })
      .expect(200)

    const block = response.body.data.dateBlocks[0]
    const groupA = block.departures.find(
      (d: { departureId: string }) => d.departureId === departureSameA.id,
    )
    const groupB = block.departures.find(
      (d: { departureId: string }) => d.departureId === departureSameB.id,
    )

    expect(groupA.outsource.totalAmountCents).toBe(200000)
    expect(groupA.outsource.items).toHaveLength(2)
    expect(groupA.outsource.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [...sameAOutsourceIds].sort(),
    )
    expect(groupA.outsource.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supplierName: `${testPrefix}-伊犁拼出社`,
          amountCents: 80000,
        }),
        expect.objectContaining({
          supplierName: `${testPrefix}-那拉提拼出社`,
          amountCents: 120000,
        }),
      ]),
    )

    expect(groupB.outsource).toMatchObject({ totalAmountCents: 0, items: [] })

    // 同日汇总合并各发团拼出，不伪造客源分配
    expect(block.outsource.totalAmountCents).toBe(200000)
    expect(block.outsource.items).toHaveLength(2)

    for (const group of block.departures) {
      for (const row of group.sourceOrders) {
        expect(row).not.toHaveProperty('outsource')
        expect(row).not.toHaveProperty('outsourceAmountCents')
        expect(row).not.toHaveProperty('outsourceTotalCents')
        expect(row).not.toHaveProperty('outsourceSupplierName')
        expect(JSON.stringify(row)).not.toMatch(/拼出价|拼出合计/)
      }
    }
  })
})
