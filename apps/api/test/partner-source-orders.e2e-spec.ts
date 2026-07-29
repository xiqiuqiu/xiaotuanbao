import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleCloseDisposition,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Partner source orders API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let otherPartnerId: string
  const testPrefix = `e2e-partner-so-${Date.now()}`

  // 固定 fixtures：三张跨发团客源单（P1）＋一张干扰客源单（P2）
  // D1 出团 2026-06-10：成人2×1000 + 儿童1×500，立减 300，split 客户已收 1200
  // D2 出团 2026-07-05：成人5×800，无优惠，partner_settled
  // D3 出团 2026-05-20：成人1×600，无优惠，guest_only
  let departure1: { id: string; departureNo: string }
  let departure2: { id: string; departureNo: string }
  let departure3: { id: string; departureNo: string }
  let order2Id: string

  async function createDeparture(name: string, startDate: string, endDate: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name,
        routeName: '喀纳斯阿勒泰10日线',
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
        name: `${testPrefix}-partner`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const otherPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-partner-second`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    otherPartnerId = otherPartner.id

    departure1 = await createDeparture(`${testPrefix}-d1`, '2026-06-10', '2026-06-14')
    departure2 = await createDeparture(`${testPrefix}-d2`, '2026-07-05', '2026-07-09')
    departure3 = await createDeparture(`${testPrefix}-d3`, '2026-05-20', '2026-05-24')

    await createOrder(departure1.id, {
      partnerId,
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 50000,
      discountType: SourceOrderDiscountType.lump_sum,
      discountCents: 30000,
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 120000,
      balanceCents: 100000,
    })
    order2Id = await createOrder(departure2.id, {
      partnerId,
      adultGuestCount: 5,
      childGuestCount: 0,
      adultUnitPriceCents: 80000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.partner_settled,
    })
    await createOrder(departure3.id, {
      partnerId,
      adultGuestCount: 1,
      childGuestCount: 0,
      adultUnitPriceCents: 60000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.guest_only,
    })
    // 干扰数据：同发团、另一 Partner
    await createOrder(departure1.id, {
      partnerId: otherPartnerId,
      adultGuestCount: 9,
      childGuestCount: 0,
      adultUnitPriceCents: 999900,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.guest_only,
    })
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
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

  it('rejects users without /partner menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无合作伙伴权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const response = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/source-orders`)
      .expect(403)

    expect(response.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role under ADR-0016 early-launch menus', async () => {
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .expect(200)
  })

  it('returns 404 for unknown partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners/nonexistent-partner-id/source-orders')
      .expect(404)

    expect(response.body.message).toBe('合作伙伴不存在')
  })

  it('returns 404 for partner in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}`),
      },
    })
    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/source-orders`)
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists all source orders across departures sorted by departure date desc', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(3)
    expect(data.items).toHaveLength(3)
    expect(data.items.map((item: { departureStartDate: string }) => item.departureStartDate)).toEqual([
      '2026-07-05',
      '2026-06-10',
      '2026-05-20',
    ])

    const first = data.items[0]
    expect(first).toMatchObject({
      departureId: departure2.id,
      departureNo: departure2.departureNo,
      departureName: `${testPrefix}-d2`,
      routeName: '喀纳斯阿勒泰10日线',
      adultGuestCount: 5,
      childGuestCount: 0,
      guestCount: 5,
      adultUnitPriceCents: 80000,
      childUnitPriceCents: 0,
      grossReceivableCents: 400000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 400000,
      partnerCollectedCents: 400000,
      guestCollectCents: 0,
    })
    expect(typeof first.displayName).toBe('string')

    // 另一 Partner 的客源单不得混入
    const grossValues = data.items.map(
      (item: { grossReceivableCents: number }) => item.grossReceivableCents,
    )
    expect(grossValues).not.toContain(8999100)
  })

  it('computes summary with seven metrics under mixed fixtures', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .expect(200)

    expect(response.body.data.summary).toMatchObject({
      orderCount: 3,
      totalGuests: 9,
      totalGrossReceivableCents: 710000,
      totalFareAdjustmentNetCents: 0,
      totalDiscountCents: 30000,
      totalNetReceivableCents: 680000,
      totalGuestCollectCents: 160000,
    })
  })

  it('filters by departure date range and summary follows the filter', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({
      departureId: departure1.id,
      departureStartDate: '2026-06-10',
      grossReceivableCents: 250000,
      fareAdjustmentNetCents: 0,
      discountCents: 30000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
    })
    expect(data.summary).toMatchObject({
      orderCount: 1,
      totalGuests: 3,
      totalGrossReceivableCents: 250000,
      totalFareAdjustmentNetCents: 0,
      totalDiscountCents: 30000,
      totalNetReceivableCents: 220000,
      totalGuestCollectCents: 100000,
    })
  })

  it('includes boundary dates in the range filter', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ departureDateFrom: '2026-05-20', departureDateTo: '2026-07-05' })
      .expect(200)

    expect(response.body.data.total).toBe(3)
  })

  it('supports open-ended range (only departureDateFrom)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ departureDateFrom: '2026-07-01' })
      .expect(200)

    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].departureStartDate).toBe('2026-07-05')
  })

  it('returns 400 when range is invalid (from after to)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ departureDateFrom: '2026-07-01', departureDateTo: '2026-06-01' })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('paginates items while summary keeps covering the whole filtered set', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ page: 2, pageSize: 2 })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(3)
    expect(data.page).toBe(2)
    expect(data.pageSize).toBe(2)
    expect(data.items).toHaveLength(1)
    expect(data.items[0].departureStartDate).toBe('2026-05-20')
    expect(data.summary).toMatchObject({
      orderCount: 3,
      totalGrossReceivableCents: 710000,
    })
  })

  it('keeps listing source orders whose receivable was closed, without any marker', async () => {
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order2Id}/generate-receivables`)
      .expect(201)
    const scheduleId = generated.body.data.schedules[0].id as string

    // ADR-0023: 关闭节点是财务动作，用 financeToken（计调已无 /finance/* 菜单）
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({
        closeDisposition: PaymentScheduleCloseDisposition.external_or_special,
        cancelReason: 'e2e 关闭应收',
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(3)
    const closedOrder = data.items.find((item: { id: string }) => item.id === order2Id)
    expect(closedOrder).toMatchObject({
      grossReceivableCents: 400000,
      netReceivableCents: 400000,
      partnerCollectedCents: 400000,
    })
    // 业务事实层不渗透财务处置：不返回应收状态类字段
    expect(closedOrder).not.toHaveProperty('receivableStatus')
    expect(data.summary.totalNetReceivableCents).toBe(680000)
  })

  it('includes fareAdjustmentNetCents on items and summary when adjustments exist', async () => {
    const departure = await createDeparture(`${testPrefix}-adj`, '2026-08-01', '2026-08-05')
    await createOrder(departure.id, {
      partnerId,
      adultGuestCount: 1,
      childGuestCount: 0,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 0,
      discountType: SourceOrderDiscountType.none,
      collectionMode: SourceOrderCollectionMode.guest_only,
      fareAdjustments: [
        {
          kind: 'single_room_topup',
          direction: 'increase',
          amountCents: 20000,
        },
      ],
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/source-orders`)
      .query({ departureDateFrom: '2026-08-01', departureDateTo: '2026-08-31' })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({
      grossReceivableCents: 100000,
      fareAdjustmentNetCents: 20000,
      discountCents: 0,
      netReceivableCents: 120000,
      guestCollectCents: 120000,
    })
    // 对外列表只露调整净额，不展开种类明细
    expect(data.items[0]).not.toHaveProperty('fareAdjustments')
    expect(JSON.stringify(data)).not.toContain('single_room_topup')
    expect(data.summary).toMatchObject({
      orderCount: 1,
      totalGrossReceivableCents: 100000,
      totalFareAdjustmentNetCents: 20000,
      totalDiscountCents: 0,
      totalNetReceivableCents: 120000,
      totalGuestCollectCents: 120000,
    })
  })
})
