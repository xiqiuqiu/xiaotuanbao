import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DepartureType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  SupplierCategory,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, DEPARTURE_NO_REGEX, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Departure API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-departure-${Date.now()}`

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
    await prisma.financeTransaction.deleteMany({
      where: {
        organizationId,
        verifications: {
          some: {
            paymentSchedule: {
              departure: { organizationId, name: { startsWith: testPrefix } },
            },
          },
        },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: {
        sourceOrder: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.segmentResource.deleteMany({
      where: {
        segment: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.partner.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPrefix },
      },
    })
    await prisma.supplier.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPrefix },
      },
    })
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  function createPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `${testPrefix}-团`,
      routeName: '喀纳斯阿勒泰10日线',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId,
      ...overrides,
    }
  }

  it('returns 403 for finance role on GET /departures', async () => {
    const response = await authRequest(app, financeToken).get('/api/departures').expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for finance role on POST /departures', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/departures')
      .send(createPayload())
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('returns preview departure number for current Shanghai month', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/next-no')
      .expect(200)

    expect(response.body.data.departureNo).toMatch(DEPARTURE_NO_REGEX)
  })

  it('returns 403 for finance role on GET /departures/next-no', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/departures/next-no')
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('creates departure with core fields', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(
        createPayload({
          name: `${testPrefix}-create`,
          departureType: DepartureType.independent,
          notes: '测试备注',
        }),
      )
      .expect(201)

    expect(response.body.data).toMatchObject({
      name: `${testPrefix}-create`,
      routeName: '喀纳斯阿勒泰10日线',
      routeSource: 'manual',
      departureType: DepartureType.independent,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      dayCount: 10,
      ownerUserId,
      status: DepartureStatus.editing,
      notes: '测试备注',
    })
    expect(response.body.data.departureNo).toMatch(DEPARTURE_NO_REGEX)
    expect(response.body.data.id).toBeTruthy()
    expect(response.body.data.departureProgress).toBeTruthy()
  })

  it('lists departures ordered by updatedAt desc', async () => {
    const first = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ name: `${testPrefix}-list-first` }))
      .expect(201)

    await new Promise((resolve) => setTimeout(resolve, 20))

    const second = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(
        createPayload({
          name: `${testPrefix}-list-second`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
        }),
      )
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({ keyword: `${testPrefix}-list`, pageSize: 50 })
      .expect(200)

    const items = response.body.data.items as Array<{ departureNo: string }>
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].departureNo).toBe(second.body.data.departureNo)
    expect(items[1].departureNo).toBe(first.body.data.departureNo)
  })

  it('rejects manual departureNo in create request', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo: `${testPrefix}-manual`, name: `${testPrefix}-manual` }))
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('does not list departures from another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-other`),
      },
    })

    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-other-user`,
        passwordHash: 'unused',
        name: '其他企业用户',
      },
    })

    const foreignNo = `${testPrefix}-foreign`
    await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        departureNo: foreignNo,
        name: `${testPrefix}-foreign-name`,
        routeName: '外部路线',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-05T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId: otherUser.id,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({ keyword: foreignNo, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items).toHaveLength(0)

    await prisma.departure.deleteMany({ where: { organizationId: otherOrg.id } })
    await prisma.user.delete({ where: { id: otherUser.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('filters departures by keyword and status', async () => {
    const created = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ name: `${testPrefix}-filter-name` }))
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({
        keyword: `${testPrefix}-filter-name`,
        status: DepartureStatus.editing,
        startDateFrom: '2026-08-01',
        startDateTo: '2026-08-31',
        pageSize: 50,
      })
      .expect(200)

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].departureNo).toBe(created.body.data.departureNo)
  })

  async function createTestDeparture(overrides: Record<string, unknown> = {}) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ ...overrides }))
      .expect(201)

    return response.body.data as { id: string; departureNo: string }
  }

  it('returns 403 for finance role on GET /departures/:id', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}`)
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('returns departure detail for coordinator', async () => {
    const departure = await createTestDeparture({ name: `${testPrefix}-detail-get` })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: departure.id,
      departureNo: departure.departureNo,
      name: `${testPrefix}-detail-get`,
      status: DepartureStatus.editing,
      totalGuests: 0,
      netReceivableCents: 0,
      payableCents: 0,
    })
    expect(response.body.data.departureProgress).toBeTruthy()
  })

  it('updates departure core fields', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({
        name: `${testPrefix}-updated`,
        notes: '更新备注',
      })
      .expect(200)

    expect(response.body.data.name).toBe(`${testPrefix}-updated`)
    expect(response.body.data.notes).toBe('更新备注')
  })

  it('transitions editing to pending_settlement', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    expect(response.body.data.status).toBe(DepartureStatus.pending_settlement)
  })

  it('returns 400 for illegal transition pending_settlement to editing', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.editing })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('不允许的状态转换')
  })

  it('closes departure and rejects patch with 409', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .expect(201)

    const patchResponse = await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({ name: `${testPrefix}-closed-edit` })
      .expect(409)

    expect(patchResponse.body.code).toBe(409)
    expect(patchResponse.body.message).toBe('发团已关闭，不可编辑')
  })

  it('returns 400 when transitioning closed departure', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('已关闭发团不可变更状态')
  })

  describe('Source orders', () => {
    let partnerId: string
    let disabledPartnerId: string

    beforeAll(async () => {
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

      const disabledPartner = await prisma.partner.create({
        data: {
          organizationId,
          name: `${testPrefix}-disabled-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.disabled,
        },
      })
      disabledPartnerId = disabledPartner.id
    })

    function sourceOrderPayload(overrides: Record<string, unknown> = {}) {
      return {
        partnerId,
        guestCount: 10,
        unitPriceCents: 100000,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        ...overrides,
      }
    }

    async function createSourceOrderDeparture() {
      return createTestDeparture({ startDate: '2026-07-01', endDate: '2026-07-05' })
    }

    it('creates source order with guest_only collection', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload())
        .expect(201)

      expect(response.body.data).toMatchObject({
        partnerId,
        guestCount: 10,
        grossReceivableCents: 1000000,
        netReceivableCents: 1000000,
        partnerCollectedCents: 0,
        guestCollectCents: 1000000,
        collectionMode: SourceOrderCollectionMode.guest_only,
        receivableStatus: 'not_generated',
        hasPaymentSchedule: false,
      })
      expect(response.body.data.displayName).toBe(`${testPrefix}-partner 7月1日发客`)
    })

    it('auto-generates displayName sequence for same partner', async () => {
      const departure = await createSourceOrderDeparture()

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload())
        .expect(201)

      const second = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload())
        .expect(201)

      expect(second.body.data.displayName).toBe(`${testPrefix}-partner 7月1日发客 2`)
    })

    it('validates split collection amounts', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            collectionMode: SourceOrderCollectionMode.split,
            partnerCollectedCents: 1100000,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('客户已收金额不能大于结算金额')
    })

    it('validates discount cannot exceed gross', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            discountType: SourceOrderDiscountType.lump_sum,
            discountCents: 2000000,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('优惠金额不能大于原始应收')
    })

    it('rejects disabled partner', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload({ partnerId: disabledPartnerId }))
        .expect(400)

      expect(response.body.message).toBe('客户不可用，请选择有效客户')
    })

    it('lists source orders with summary', async () => {
      const departure = await createSourceOrderDeparture()

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            guestCount: 5,
            discountType: SourceOrderDiscountType.lump_sum,
            discountCents: 50000,
          }),
        )
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/source-orders`)
        .expect(200)

      expect(response.body.data.items).toHaveLength(1)
      expect(response.body.data.summary).toMatchObject({
        orderCount: 1,
        totalGuests: 5,
        partnerCount: 1,
        totalDiscountCents: 50000,
        totalNetReceivableCents: 450000,
      })
    })

    it('manages guest list and syncs guest count', async () => {
      const departure = await createSourceOrderDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload({ guestCount: 1 }))
        .expect(201)

      const sourceOrderId = created.body.data.id as string

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/guests`)
        .send({ name: '张三', phone: '13800000000', gender: 'male' })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/guests`)
        .send({ name: '李四' })
        .expect(201)

      const synced = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/sync-guest-count`)
        .expect(201)

      expect(synced.body.data.guestCount).toBe(2)
    })

    it('deletes source order without payment schedule', async () => {
      const departure = await createSourceOrderDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload())
        .expect(201)

      await authRequest(app, coordinatorToken)
        .delete(`/api/source-orders/${created.body.data.id}`)
        .expect(200)

      const list = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/source-orders`)
        .expect(200)

      expect(list.body.data.items).toHaveLength(0)
    })

    it('returns 409 when deleting source order with payment schedule', async () => {
      const departure = await createSourceOrderDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload())
        .expect(201)

      const sourceOrderId = created.body.data.id as string

      await prisma.paymentSchedule.create({
        data: {
          organizationId,
          departureId: departure.id,
          direction: PaymentScheduleDirection.receivable,
          scheduleNo: `${testPrefix}-AR001`,
          title: '客户补款',
          amountCents: 100000,
          dueDate: new Date('2026-12-31T00:00:00.000Z'),
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partnerId,
          sourceType: 'source_order_customer_settlement',
          sourceId: sourceOrderId,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/source-orders/${sourceOrderId}`)
        .expect(409)

      expect(response.body.message).toBe('当前客源单已生成应收，不能直接删除')
    })
  })

  describe('Itinerary segments', () => {
    let supplierId: string

    beforeAll(async () => {
      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-segment-supplier`,
          category: SupplierCategory.transport,
          status: DirectoryProfileStatus.active,
        },
      })
      supplierId = supplier.id
    })

    function segmentPayload(overrides: Record<string, unknown> = {}) {
      return {
        name: '喀纳斯段',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '喀纳斯',
        ...overrides,
      }
    }

    async function createSegmentDeparture() {
      return createTestDeparture({ startDate: '2026-08-01', endDate: '2026-08-10' })
    }

    it('creates segment with computed day count and default guest count', async () => {
      const departure = await createSegmentDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      expect(response.body.data).toMatchObject({
        name: '喀纳斯段',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        dayCount: 3,
        destination: '喀纳斯',
        applicableGuestCount: 1,
        fromTemplate: false,
        resourceCount: 0,
        outsourceCount: 0,
        resourceAmountCents: 0,
        payableStatus: 'not_generated',
      })
    })

    it('defaults applicable guest count from source orders', async () => {
      const departure = await createSegmentDeparture()
      const partner = await prisma.partner.findFirst({
        where: { organizationId, name: { startsWith: testPrefix } },
      })
      if (!partner) {
        throw new Error('Partner not found')
      }

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: partner.id,
          guestCount: 12,
          unitPriceCents: 100000,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload({ name: '阿勒泰段', startDate: '2026-08-04', endDate: '2026-08-10' }))
        .expect(201)

      expect(response.body.data.applicableGuestCount).toBe(12)
    })

    it('lists segments with summary', async () => {
      const departure = await createSegmentDeparture()

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(
          segmentPayload({
            name: '阿勒泰段',
            startDate: '2026-08-04',
            endDate: '2026-08-10',
          }),
        )
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/segments`)
        .expect(200)

      expect(response.body.data.total).toBe(2)
      expect(response.body.data.summary).toMatchObject({
        segmentCount: 2,
        totalDays: 10,
        resourceCount: 0,
        payableOverview: 'not_generated',
      })
      expect(response.body.data.items[0].name).toBe('喀纳斯段')
      expect(response.body.data.items[1].name).toBe('阿勒泰段')
    })

    it('returns 400 when end date is before start date', async () => {
      const departure = await createSegmentDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload({ startDate: '2026-08-05', endDate: '2026-08-03' }))
        .expect(400)

      expect(response.body.message).toBe('结束日期不能早于开始日期')
    })

    it('returns 400 when segment dates exceed departure range', async () => {
      const departure = await createSegmentDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload({ startDate: '2026-07-28', endDate: '2026-08-03' }))
        .expect(400)

      expect(response.body.message).toBe('行程段日期不能超出发团日期')
    })

    it('updates segment fields', async () => {
      const departure = await createSegmentDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .patch(`/api/segments/${created.body.data.id}`)
        .send({ name: '喀纳斯修订段', applicableGuestCount: 8 })
        .expect(200)

      expect(response.body.data.name).toBe('喀纳斯修订段')
      expect(response.body.data.applicableGuestCount).toBe(8)
    })

    it('deletes segment without resources', async () => {
      const departure = await createSegmentDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      await authRequest(app, coordinatorToken)
        .delete(`/api/segments/${created.body.data.id}`)
        .expect(200)

      const list = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/segments`)
        .expect(200)

      expect(list.body.data.total).toBe(0)
    })

    it('returns 409 when deleting segment with resources', async () => {
      const departure = await createSegmentDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      const segmentId = created.body.data.id as string

      await prisma.segmentResource.create({
        data: {
          segmentId,
          resourceKind: ResourceKind.transport,
          counterpartyType: CounterpartyType.supplier,
          supplierId,
          title: '用车',
          amountCents: 360000,
          fromTemplate: false,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/segments/${segmentId}`)
        .expect(409)

      expect(response.body.message).toBe('当前行程段已有资源，不能删除')
    })

    it('returns 409 when mutating segments on closed departure', async () => {
      const departure = await createSegmentDeparture()

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .expect(201)

      const createResponse = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(409)

      expect(createResponse.body.message).toBe('发团已关闭，不可编辑')
    })
  })

  describe('Read Model', () => {
    let rmPartnerId: string
    let rmSupplierId: string

    beforeAll(async () => {
      const partner = await prisma.partner.create({
        data: {
          organizationId,
          name: `${testPrefix}-rm-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })
      rmPartnerId = partner.id

      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-rm-supplier`,
          category: SupplierCategory.transport,
          status: DirectoryProfileStatus.active,
        },
      })
      rmSupplierId = supplier.id
    })

    async function createReadModelDeparture(suffix = '') {
      const response = await authRequest(app, coordinatorToken)
        .post('/api/departures')
        .send(
          createPayload({
            name: `${testPrefix}-rm${suffix}`,
            startDate: '2026-08-01',
            endDate: '2026-08-10',
          }),
        )
        .expect(201)

      return response.body.data as { id: string }
    }

    async function seedDepartureData(departureId: string) {
      const sourceOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departureId}/source-orders`)
        .send({
          partnerId: rmPartnerId,
          guestCount: 10,
          unitPriceCents: 100000,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departureId}/segments`)
        .send({
          name: '喀纳斯段',
          startDate: '2026-08-01',
          endDate: '2026-08-05',
          destination: '喀纳斯',
        })
        .expect(201)

      const resource = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.transport,
          supplierId: rmSupplierId,
          title: '用车',
          amountCents: 360000,
        })
        .expect(201)

      return {
        sourceOrderId: sourceOrder.body.data.id as string,
        displayName: sourceOrder.body.data.displayName as string,
        resourceId: resource.body.data.id as string,
      }
    }

    it('returns aggregated read model fields on detail', async () => {
      const departure = await createReadModelDeparture('-detail')
      await seedDepartureData(departure.id)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(response.body.data).toMatchObject({
        totalGuests: 10,
        sourceOrderCount: 1,
        segmentCount: 1,
        resourceCount: 1,
        grossReceivableCents: 1000000,
        discountCents: 0,
        netReceivableCents: 1000000,
        payableCents: 360000,
        estimatedMarginCents: 640000,
        collectedCents: 0,
        uncollectedCents: 0,
        paidCents: 0,
        unpaidCents: 0,
        isFinanciallySettled: false,
      })
      expect(response.body.data.completionTags).toMatchObject({
        sourceOrders: '客源1单',
        segments: '行程1段',
        resources: '资源1项',
        receivables: '应收未生成',
        payables: '应付未生成',
      })
    })

    it('returns completionTags on list items', async () => {
      const departure = await createReadModelDeparture('-list')
      await seedDepartureData(departure.id)

      const response = await authRequest(app, coordinatorToken)
        .get('/api/departures')
        .query({ keyword: `${testPrefix}-rm-list`, pageSize: 10 })
        .expect(200)

      const item = response.body.data.items.find(
        (row: { id: string }) => row.id === departure.id,
      )
      expect(item).toBeTruthy()
      expect(item.completionTags).toMatchObject({
        sourceOrders: '客源1单',
        segments: '行程1段',
        resources: '资源1项',
      })
      expect(item.netReceivableCents).toBe(1000000)
      expect(item.payableCents).toBe(360000)
    })

    it('filters departures by partnerId', async () => {
      const withPartner = await createReadModelDeparture('-partner-a')
      await seedDepartureData(withPartner.id)

      const withoutPartner = await createReadModelDeparture('-partner-b')

      const response = await authRequest(app, coordinatorToken)
        .get('/api/departures')
        .query({ partnerId: rmPartnerId, keyword: `${testPrefix}-rm-partner`, pageSize: 20 })
        .expect(200)

      const ids = response.body.data.items.map((item: { id: string }) => item.id)
      expect(ids).toContain(withPartner.id)
      expect(ids).not.toContain(withoutPartner.id)
    })

    it('reflects collected and uncollected amounts after confirm-collection', async () => {
      const departure = await createReadModelDeparture('-finance')
      const seeded = await seedDepartureData(departure.id)

      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)

      const scheduleId = generated.body.data.schedules[0].id as string

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
        .send({
          amountCents: 500000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(response.body.data.collectedCents).toBe(500000)
      expect(response.body.data.uncollectedCents).toBe(500000)
      expect(response.body.data.completionTags.receivables).toBe('应收已生成')
      expect(response.body.data.isFinanciallySettled).toBe(false)
    })

    it('sets isFinanciallySettled when all schedules are settled or cancelled', async () => {
      const departure = await createReadModelDeparture('-settled')
      const seeded = await seedDepartureData(departure.id)

      const receivable = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const receivableScheduleId = receivable.body.data.schedules[0].id as string

      const payable = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${seeded.resourceId}/generate-payable`)
        .expect(201)
      const payableScheduleId = payable.body.data.schedule.id as string

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivableScheduleId}/confirm-collection`)
        .send({
          amountCents: 1000000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
        .send({
          amountCents: 360000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: rmSupplierId,
        })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(detail.body.data.isFinanciallySettled).toBe(true)
      expect(detail.body.data.completionTags.receivables).toBe('已收齐')
      expect(detail.body.data.completionTags.payables).toBe('已付清')
      expect(detail.body.data.collectedCents).toBe(1000000)
      expect(detail.body.data.uncollectedCents).toBe(0)
      expect(detail.body.data.paidCents).toBe(360000)
      expect(detail.body.data.unpaidCents).toBe(0)
    })

    it('rejects pending_settlement to settled when not financially settled', async () => {
      const departure = await createReadModelDeparture('-reject-settled')
      await seedDepartureData(departure.id)

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: DepartureStatus.pending_settlement })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: DepartureStatus.settled })
        .expect(400)

      expect(response.body.message).toBe('全部账款尚未结清，不可标记为已结清')
    })

    it('transitions pending_settlement to settled when financially settled', async () => {
      const departure = await createReadModelDeparture('-transition-settled')
      const seeded = await seedDepartureData(departure.id)

      const receivable = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const receivableScheduleId = receivable.body.data.schedules[0].id as string

      const payable = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${seeded.resourceId}/generate-payable`)
        .expect(201)
      const payableScheduleId = payable.body.data.schedule.id as string

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivableScheduleId}/confirm-collection`)
        .send({
          amountCents: 1000000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
        .send({
          amountCents: 360000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: rmSupplierId,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: DepartureStatus.pending_settlement })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: DepartureStatus.settled })
        .expect(201)

      expect(response.body.data.status).toBe(DepartureStatus.settled)
      expect(response.body.data.isFinanciallySettled).toBe(true)
    })
  })
})
