import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

/**
 * #183 线路账本主干读 API：
 * GET /departures/route-ledger — 精确 routeName + 可选出团日区间 → 日块 → 发团组 → 客源行。
 */
describe('Departure route ledger API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  const testPrefix = `e2e-route-ledger-${Date.now()}`
  const routeName = `${testPrefix}-伊犁环线`
  const otherRouteName = `${testPrefix}-阿勒泰拼车`

  // Fixtures（本组织）：
  // D-early  出团 2026-07-10：早于同日多团日，用于日期正序
  // D-same-a / D-same-b  同日出团 2026-07-15：验证发团嵌套不打平
  // D-late   出团 2026-07-20：字段映射样例（含优惠与收款拆分）
  // D-other-route：近似路线名，精确匹配时不得混入
  // D-aug：出团 2026-08-05，日期区间过滤时排除
  let departureEarly: { id: string; departureNo: string }
  let departureSameA: { id: string; departureNo: string }
  let departureSameB: { id: string; departureNo: string }
  let departureLate: { id: string; departureNo: string }
  let orderLateId: string

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
  })

  afterAll(async () => {
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.departure.deleteMany({
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
      grossReceivableCents: 250000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
      notes: '窗口位',
    })

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
})
