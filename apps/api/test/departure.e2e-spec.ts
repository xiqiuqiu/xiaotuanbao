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
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel } from '@xiaotuanbao/shared'
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
      .send({ reason: '测试归档' })
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
      .send({ reason: '测试归档' })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('已关闭发团不可变更状态')
  })

  describe('Archive / unarchive (issue #85)', () => {
    let adminToken: string

    beforeAll(async () => {
      adminToken = await loginAs(app, 'admin')
    })

    it('rejects close without reason', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-close-no-reason` })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({})
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('rejects close with blank reason', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-close-blank-reason` })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '   ' })
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('archives departure with required reason and records operator history', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-archive-reason` })

      const closed = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '本团业务结束，归档备查' })
        .expect(201)

      expect(closed.body.data.status).toBe(DepartureStatus.closed)
      expect(closed.body.data.archiveHistory).toEqual([
        expect.objectContaining({
          action: 'archive',
          reason: '本团业务结束，归档备查',
          operatedBy: ownerUserId,
        }),
      ])
      expect(closed.body.data.archiveHistory[0].operatedAt).toBeTruthy()
      expect(closed.body.data.archiveHistory[0].operatedByName).toBeTruthy()

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(detail.body.data.status).toBe(DepartureStatus.closed)
      expect(detail.body.data.archiveHistory).toHaveLength(1)
      expect(detail.body.data.archiveHistory[0]).toMatchObject({
        action: 'archive',
        reason: '本团业务结束，归档备查',
        operatedBy: ownerUserId,
      })
    })

    it('rejects unarchive without reason', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-unarchive-no-reason` })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '先归档' })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({})
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('rejects unarchive when departure is not closed', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-unarchive-not-closed` })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '误操作' })
        .expect(400)

      expect(response.body.code).toBe(400)
      expect(response.body.message).toBe('仅已关闭发团可以解除归档')
    })

    it('unarchives closed departure to pending_settlement and keeps original archive history', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-unarchive-keep` })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '原归档原因不可丢' })
        .expect(201)

      const unarchived = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '发现账款需继续处理' })
        .expect(201)

      expect(unarchived.body.data.status).toBe(DepartureStatus.pending_settlement)
      expect(unarchived.body.data.archiveHistory).toHaveLength(2)
      expect(unarchived.body.data.archiveHistory[0]).toMatchObject({
        action: 'archive',
        reason: '原归档原因不可丢',
        operatedBy: ownerUserId,
      })
      expect(unarchived.body.data.archiveHistory[1]).toMatchObject({
        action: 'unarchive',
        reason: '发现账款需继续处理',
        operatedBy: ownerUserId,
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(detail.body.data.status).toBe(DepartureStatus.pending_settlement)
      expect(detail.body.data.archiveHistory).toHaveLength(2)
      expect(detail.body.data.archiveHistory.map((item: { reason: string }) => item.reason)).toEqual([
        '原归档原因不可丢',
        '发现账款需继续处理',
      ])
    })

    it('allows enterprise admin to unarchive', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-unarchive-admin` })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '计调归档' })
        .expect(201)

      const response = await authRequest(app, adminToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '企业管理员解除归档' })
        .expect(201)

      expect(response.body.data.status).toBe(DepartureStatus.pending_settlement)
      expect(response.body.data.archiveHistory).toHaveLength(2)
      expect(response.body.data.archiveHistory[1].action).toBe('unarchive')
      expect(response.body.data.archiveHistory[1].reason).toBe('企业管理员解除归档')
    })

    it('rejects finance role from closing or unarchiving', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-finance-denied` })

      const closeDenied = await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '财务不应归档' })
        .expect(403)

      expect(closeDenied.body.message).toBe('无权访问')

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '计调归档后测财务' })
        .expect(201)

      const unarchiveDenied = await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '财务不应解除归档' })
        .expect(403)

      expect(unarchiveDenied.body.message).toBe('无权访问')
    })

    it('rejects cross-organization close and unarchive', async () => {
      const otherOrg = await prisma.organization.create({
        data: {
          name: `${testPrefix}-archive-other-org`,
          businessPrefix: uniqueBusinessPrefix(`${testPrefix}-arch`),
        },
      })
      const otherUser = await prisma.user.create({
        data: {
          organizationId: otherOrg.id,
          username: `${testPrefix}-archive-other-user`,
          passwordHash: 'unused',
          name: '跨企业用户',
        },
      })
      const foreign = await prisma.departure.create({
        data: {
          organizationId: otherOrg.id,
          departureNo: `${testPrefix}-arch-foreign`,
          name: `${testPrefix}-arch-foreign-name`,
          routeName: '外部路线',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-05T00:00:00.000Z'),
          dayCount: 5,
          ownerUserId: otherUser.id,
          status: DepartureStatus.closed,
        },
      })

      const closeDenied = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${foreign.id}/close`)
        .send({ reason: '跨企业归档' })
        .expect(404)
      expect(closeDenied.body.message).toBe('发团不存在')

      const unarchiveDenied = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${foreign.id}/unarchive`)
        .send({ reason: '跨企业解除归档' })
        .expect(404)
      expect(unarchiveDenied.body.message).toBe('发团不存在')

      await prisma.departure.delete({ where: { id: foreign.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
      await prisma.organization.delete({ where: { id: otherOrg.id } })
    })

    it('preserves prior archive history after re-archive', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-rearchive` })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '第一次归档' })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '中间解除' })
        .expect(201)

      const rearchived = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '第二次归档' })
        .expect(201)

      expect(rearchived.body.data.status).toBe(DepartureStatus.closed)
      expect(rearchived.body.data.archiveHistory).toHaveLength(3)
      expect(rearchived.body.data.archiveHistory.map((item: { reason: string }) => item.reason)).toEqual([
        '第一次归档',
        '中间解除',
        '第二次归档',
      ])
    })
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
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
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
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
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

    it('derives guestCount and gross from adult/child pricing (2×1200 + 1×800)', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            adultGuestCount: 2,
            childGuestCount: 1,
            adultUnitPriceCents: 120000,
            childUnitPriceCents: 80000,
          }),
        )
        .expect(201)

      expect(response.body.data).toMatchObject({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        guestCount: 3,
        grossReceivableCents: 320000,
        netReceivableCents: 320000,
        guestCollectCents: 320000,
      })
      expect(response.body.data).not.toHaveProperty('unitPriceCents')
    })

    it('rejects total guest count less than 1', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            adultGuestCount: 0,
            childGuestCount: 0,
            adultUnitPriceCents: undefined,
            childUnitPriceCents: undefined,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('总人数必须大于0')
    })

    it('rejects missing adult unit price when adult count > 0', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            adultGuestCount: 2,
            childGuestCount: 0,
            childUnitPriceCents: 0,
            adultUnitPriceCents: undefined,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('成人团款单价不能为空')
    })

    it('rejects missing child unit price when child count > 0', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            adultGuestCount: 0,
            childGuestCount: 1,
            adultUnitPriceCents: 0,
            childUnitPriceCents: undefined,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('儿童团款单价不能为空')
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
            adultGuestCount: 5,
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

    it('manages guest list without writing back source order guest count', async () => {
      const departure = await createSourceOrderDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(sourceOrderPayload({ adultGuestCount: 1 }))
        .expect(201)

      const sourceOrderId = created.body.data.id as string

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/guests`)
        .send({ name: '张三', phone: '13800000000', gender: 'male' })
        .expect(201)

      const secondGuest = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/guests`)
        .send({ name: '李四' })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrderId}/sync-guest-count`)
        .expect(404)

      const afterCreate = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/source-orders`)
        .expect(200)

      expect(afterCreate.body.data.items[0].guestCount).toBe(1)
      expect(afterCreate.body.data.items[0].id).toBe(sourceOrderId)

      const guestsAfterCreate = await authRequest(app, coordinatorToken)
        .get(`/api/source-orders/${sourceOrderId}/guests`)
        .expect(200)

      expect(guestsAfterCreate.body.data).toHaveLength(2)

      await authRequest(app, coordinatorToken)
        .patch(`/api/source-orders/${sourceOrderId}/guests/${secondGuest.body.data.id}`)
        .send({ name: '李四改' })
        .expect(200)

      await authRequest(app, coordinatorToken)
        .delete(`/api/source-orders/${sourceOrderId}/guests/${secondGuest.body.data.id}`)
        .expect(200)

      const afterDelete = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/source-orders`)
        .expect(200)

      expect(afterDelete.body.data.items[0].guestCount).toBe(1)

      const guestsAfterDelete = await authRequest(app, coordinatorToken)
        .get(`/api/source-orders/${sourceOrderId}/guests`)
        .expect(200)

      expect(guestsAfterDelete.body.data).toHaveLength(1)
      expect(guestsAfterDelete.body.data[0].name).toBe('张三')
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
          categories: [ResourceKind.transport, ResourceKind.hotel, ResourceKind.guide],
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

    it('creates segment with computed day count', async () => {
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
        resourceCount: 0,
        outsourceCount: 0,
        resourceAmountCents: 0,
        payableStatus: 'not_generated',
      })
      expect(response.body.data).not.toHaveProperty('applicableGuestCount')
      expect(response.body.data).not.toHaveProperty('fromTemplate')
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

    it('aggregates payableOverview and segment payableStatus from resource finance meta', async () => {
      const departure = await createSegmentDeparture()

      const segmentA = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      const segmentB = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(
          segmentPayload({
            name: '阿勒泰段',
            startDate: '2026-08-04',
            endDate: '2026-08-10',
          }),
        )
        .expect(201)

      const resourcePending = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.transport,
          supplierId,
          title: '喀纳斯用车',
          amountCents: 100000,
        })
        .expect(201)

      const resourcePaid = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId,
          title: '喀纳斯酒店',
          amountCents: 200000,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentB.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.guide,
          supplierId,
          title: '阿勒泰导游（未生成）',
          amountCents: 50000,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resourcePending.body.data.id}/generate-payable`)
        .expect(201)

      const paidGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resourcePaid.body.data.id}/generate-payable`)
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${paidGenerated.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 200000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.OTHER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/segments`)
        .expect(200)

      expect(response.body.data.summary).toMatchObject({
        segmentCount: 2,
        resourceCount: 3,
        payableOverview: 'partial',
      })

      const items = response.body.data.items as Array<{
        id: string
        payableStatus: string
        resourceCount: number
      }>
      const itemA = items.find((item) => item.id === segmentA.body.data.id)
      const itemB = items.find((item) => item.id === segmentB.body.data.id)

      expect(itemA).toMatchObject({
        resourceCount: 2,
        payableStatus: 'partial',
      })
      expect(itemB).toMatchObject({
        resourceCount: 1,
        payableStatus: 'not_generated',
      })
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
        .send({ name: '喀纳斯修订段', destination: '禾木' })
        .expect(200)

      expect(response.body.data.name).toBe('喀纳斯修订段')
      expect(response.body.data.destination).toBe('禾木')
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
        .send({ reason: '测试归档' })
        .expect(201)

      const createResponse = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(409)

      expect(createResponse.body.message).toBe('发团已关闭，不可编辑')
    })
  })

  describe('Segment resources · supplier category match (issue #64)', () => {
    async function createResourceSegment() {
      const departure = await createTestDeparture({
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      })
      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '喀纳斯段',
          startDate: '2026-08-01',
          endDate: '2026-08-03',
          destination: '喀纳斯',
        })
        .expect(201)
      return segment.body.data.id as string
    }

    it('rejects create when resourceKind is not in supplier.categories', async () => {
      const segmentId = await createResourceSegment()
      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-kind-mismatch-supplier`,
          categories: [ResourceKind.transport],
          status: DirectoryProfileStatus.active,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: supplier.id,
          title: '酒店费',
          amountCents: 100000,
        })
        .expect(400)

      expect(response.body.message).toBe('资源种类「酒店」不属于该供应商的类别集合')
    })

    it('allows the same hotel+meal supplier for both hotel and meal resources', async () => {
      const segmentId = await createResourceSegment()
      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-hotel-meal-supplier`,
          categories: [ResourceKind.hotel, ResourceKind.meal],
          status: DirectoryProfileStatus.active,
        },
      })

      const hotel = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: supplier.id,
          title: '酒店费',
          amountCents: 200000,
        })
        .expect(201)

      const meal = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.meal,
          supplierId: supplier.id,
          title: '餐费',
          amountCents: 80000,
        })
        .expect(201)

      expect(hotel.body.data).toMatchObject({
        resourceKind: ResourceKind.hotel,
        supplierId: supplier.id,
      })
      expect(hotel.body.data).not.toHaveProperty('fromTemplate')
      expect(meal.body.data).toMatchObject({
        resourceKind: ResourceKind.meal,
        supplierId: supplier.id,
      })
      expect(meal.body.data).not.toHaveProperty('fromTemplate')
    })

    it('rejects update when new resourceKind is not in supplier.categories', async () => {
      const segmentId = await createResourceSegment()
      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-kind-update-supplier`,
          categories: [ResourceKind.hotel, ResourceKind.meal],
          status: DirectoryProfileStatus.active,
        },
      })

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: supplier.id,
          title: '酒店费',
          amountCents: 100000,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .patch(`/api/segment-resources/${created.body.data.id}`)
        .send({ resourceKind: ResourceKind.transport })
        .expect(400)

      expect(response.body.message).toBe('资源种类「用车」不属于该供应商的类别集合')
    })

    it('still creates outsource resources with partner (no supplier category check)', async () => {
      const segmentId = await createResourceSegment()
      const partner = await prisma.partner.create({
        data: {
          organizationId,
          name: `${testPrefix}-outsource-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.outsource,
          partnerId: partner.id,
          title: '拼出阿勒泰',
          amountCents: 150000,
        })
        .expect(201)

      expect(response.body.data).toMatchObject({
        resourceKind: ResourceKind.outsource,
        partnerId: partner.id,
        supplierId: null,
      })
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
          categories: [ResourceKind.transport],
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
          adultGuestCount: 10,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
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
          paymentChannel: PaymentChannel.OTHER,
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
          paymentChannel: PaymentChannel.OTHER,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
        .send({
          amountCents: 360000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.OTHER,
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
          paymentChannel: PaymentChannel.OTHER,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
        .send({
          amountCents: 360000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.OTHER,
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
