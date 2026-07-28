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
  TransactionDirection,
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
        OR: [
          { departure: { name: { startsWith: testPrefix } } },
          {
            verifications: {
              some: {
                paymentSchedule: {
                  departure: { organizationId, name: { startsWith: testPrefix } },
                },
              },
            },
          },
        ],
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

  it('allows finance role on GET /departures (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, financeToken).get('/api/departures').expect(200)

    expect(response.body.data.items).toEqual(expect.any(Array))
  })

  it('allows finance role owner options without /system/users access', async () => {
    await authRequest(app, financeToken).get('/api/users').expect(403)

    const response = await authRequest(app, financeToken).get('/api/users/options').expect(200)

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ownerUserId,
          name: expect.any(String),
        }),
      ]),
    )
    expect(response.body.data[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
    })
  })

  it('forbids finance role on POST /departures (ADR-0023 departure:write)', async () => {
    await authRequest(app, financeToken)
      .post('/api/departures')
      .send(createPayload({ name: `${testPrefix}-finance-create` }))
      .expect(403)
  })

  it('returns preview departure number for current Shanghai month', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/next-no')
      .expect(200)

    expect(response.body.data.departureNo).toMatch(DEPARTURE_NO_REGEX)
  })

  it('allows finance role on GET /departures/next-no (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/departures/next-no')
      .expect(200)

    expect(response.body.data.departureNo).toMatch(DEPARTURE_NO_REGEX)
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

    return response.body.data as { id: string; departureNo: string; canPurge?: boolean }
  }

  describe('Departure Purge (ADR-0028)', () => {
    it('purges empty editing departure and returns 404 on detail', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-empty` })
      expect(created.canPurge).toBe(true)

      await authRequest(app, coordinatorToken).delete(`/api/departures/${created.id}`).expect(200)

      await authRequest(app, coordinatorToken).get(`/api/departures/${created.id}`).expect(404)

      const listed = await authRequest(app, coordinatorToken)
        .get('/api/departures')
        .query({ keyword: `${testPrefix}-purge-empty`, pageSize: 50 })
        .expect(200)
      expect(
        (listed.body.data.items as Array<{ id: string }>).some((item) => item.id === created.id),
      ).toBe(false)
    })

    it('purges pending_settlement empty shell and keeps departureNo unreleased', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-pending` })
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${created.id}/transition`)
        .send({ targetStatus: DepartureStatus.pending_settlement })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.canPurge).toBe(true)

      await authRequest(app, coordinatorToken).delete(`/api/departures/${created.id}`).expect(200)

      const next = await authRequest(app, coordinatorToken).get('/api/departures/next-no').expect(200)
      expect(next.body.data.departureNo).not.toBe(created.departureNo)
    })

    it('purges departure that only has itinerary segments', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-segments` })
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${created.id}/segments`)
        .send({ name: 'D1 乌鲁木齐' })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.segmentCount).toBe(1)
      expect(detail.body.data.canPurge).toBe(true)

      await authRequest(app, coordinatorToken).delete(`/api/departures/${created.id}`).expect(200)

      const segmentCount = await prisma.itinerarySegment.count({
        where: { departureId: created.id },
      })
      expect(segmentCount).toBe(0)
    })

    it('forbids finance role on DELETE /departures/:id', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-finance` })
      await authRequest(app, financeToken).delete(`/api/departures/${created.id}`).expect(403)
    })

    it('returns 409 when closed', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-closed` })
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${created.id}/close`)
        .send({ reason: '归档后不可 purge' })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.canPurge).toBe(false)

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/departures/${created.id}`)
        .expect(409)
      expect(response.body.message).toBe('已结清或已关闭的发团不能删除，请使用关闭/解除归档')
    })

    it('returns 409 when settled', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-settled` })
      // 空壳通常无法经 transition 进入已结清；直接置状态以覆盖 purge 状态门。
      await prisma.departure.update({
        where: { id: created.id },
        data: { status: DepartureStatus.settled },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.status).toBe(DepartureStatus.settled)
      expect(detail.body.data.canPurge).toBe(false)

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/departures/${created.id}`)
        .expect(409)
      expect(response.body.message).toBe('已结清或已关闭的发团不能删除，请使用关闭/解除归档')
    })

    it('returns 409 when source order exists', async () => {
      const partner = await prisma.partner.create({
        data: {
          organizationId,
          name: `${testPrefix}-purge-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })
      const created = await createTestDeparture({ name: `${testPrefix}-purge-source` })
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${created.id}/source-orders`)
        .send({
          partnerId: partner.id,
          adultGuestCount: 2,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.canPurge).toBe(false)

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/departures/${created.id}`)
        .expect(409)
      expect(response.body.message).toBe('已有客源单，不能删除发团')
    })

    it('returns 409 when voided payment schedule exists', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-voided-ps` })
      await prisma.paymentSchedule.create({
        data: {
          organizationId,
          departureId: created.id,
          direction: PaymentScheduleDirection.payable,
          scheduleNo: `${testPrefix}-AP-void`,
          title: '已作废应付',
          amountCents: 10000,
          dueDate: new Date('2026-08-01T00:00:00.000Z'),
          counterpartyType: CounterpartyType.supplier,
          sourceType: 'manual',
          voidedAt: new Date(),
          voidReason: '误生成',
          voidedAmountCents: 10000,
        },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.canPurge).toBe(false)

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/departures/${created.id}`)
        .expect(409)
      expect(response.body.message).toBe('已有收付款节点，不能删除发团')
    })

    it('returns 409 when voided finance transaction exists', async () => {
      const created = await createTestDeparture({ name: `${testPrefix}-purge-voided-tx` })
      await prisma.financeTransaction.create({
        data: {
          organizationId,
          departureId: created.id,
          transactionNo: `${testPrefix}-TX-void`,
          direction: TransactionDirection.inflow,
          paymentChannel: PaymentChannel.OTHER,
          amountCents: 10000,
          transactionDate: new Date('2026-08-01T00:00:00.000Z'),
          counterpartyType: CounterpartyType.partner,
          counterpartyName: '测试往来',
          voidedAt: new Date(),
          voidReason: '误录',
        },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${created.id}`)
        .expect(200)
      expect(detail.body.data.canPurge).toBe(false)

      const response = await authRequest(app, coordinatorToken)
        .delete(`/api/departures/${created.id}`)
        .expect(409)
      expect(response.body.message).toBe('已有归属本团的收支流水，不能删除发团')
    })
  })

  it('allows finance role on GET /departures/:id (ADR-0016 early-launch menus)', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)

    expect(response.body.data.id).toBe(departure.id)
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

  describe('Departure execution crew (issue #206)', () => {
    let transportSupplierId: string
    let guideSupplierId: string
    let hotelSupplierId: string

    beforeAll(async () => {
      const [transportSupplier, guideSupplier, hotelSupplier] = await Promise.all([
        prisma.supplier.create({
          data: {
            organizationId,
            name: `${testPrefix}-crew-transport`,
            categories: [ResourceKind.transport],
          },
        }),
        prisma.supplier.create({
          data: {
            organizationId,
            name: `${testPrefix}-crew-guide`,
            categories: [ResourceKind.guide],
          },
        }),
        prisma.supplier.create({
          data: {
            organizationId,
            name: `${testPrefix}-crew-hotel`,
            categories: [ResourceKind.hotel],
          },
        }),
      ])
      transportSupplierId = transportSupplier.id
      guideSupplierId = guideSupplier.id
      hotelSupplierId = hotelSupplier.id
    })

    it('saves and displays crew without creating payables', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-crew-valid` })
      const payableCountBefore = await prisma.paymentSchedule.count({
        where: { organizationId, departureId: departure.id },
      })

      const response = await authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({
          driverSupplierId: transportSupplierId,
          guideSupplierId,
          vehiclePlate: '新A·20601',
        })
        .expect(200)

      expect(response.body.data).toMatchObject({
        driverSupplierId: transportSupplierId,
        driverSupplierName: `${testPrefix}-crew-transport`,
        guideSupplierId,
        guideSupplierName: `${testPrefix}-crew-guide`,
        vehiclePlate: '新A·20601',
      })

      const operationsSheet = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      expect(operationsSheet.body.data.departure).toMatchObject({
        driverSupplierName: `${testPrefix}-crew-transport`,
        guideSupplierName: `${testPrefix}-crew-guide`,
        vehiclePlate: '新A·20601',
      })
      expect(
        await prisma.paymentSchedule.count({
          where: { organizationId, departureId: departure.id },
        }),
      ).toBe(payableCountBefore)
    })

    it('rejects suppliers outside the required crew category', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-crew-invalid` })

      const invalidDriver = await authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ driverSupplierId: hotelSupplierId })
        .expect(400)
      expect(invalidDriver.body.message).toBe('司机必须选择含「用车」类别的供应商')

      const invalidGuide = await authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ guideSupplierId: transportSupplierId })
        .expect(400)
      expect(invalidGuide.body.message).toBe('导游必须选择含「导游」类别的供应商')
    })
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
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('发团已关闭，不可变更状态')
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

    it('forbids finance role from close and unarchive (ADR-0023 departure:write)', async () => {
      const departure = await createTestDeparture({ name: `${testPrefix}-finance-archive` })

      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '财务归档' })
        .expect(403)

      // 由计调关闭后，财务同样无权解除归档。
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '计调归档' })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/unarchive`)
        .send({ reason: '财务解除归档' })
        .expect(403)
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
      expect(response.body.data.displayName).toBe(`${testPrefix}-partner`)
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

      expect(second.body.data.displayName).toBe(`${testPrefix}-partner 2`)
    })

    it('validates split collection amounts', async () => {
      const departure = await createSourceOrderDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send(
          sourceOrderPayload({
            collectionMode: SourceOrderCollectionMode.split,
            depositCents: 1100000,
            balanceCents: 0,
          }),
        )
        .expect(400)

      expect(response.body.message).toBe('代收场景的 G约定 必须大于0')
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

      expect(response.body.message).toBe('结算金额不能为负数')
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
        totalGrossReceivableCents: 500000,
        totalFareAdjustmentNetCents: 0,
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
        sortOrder: 0,
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

    it('creates segment without dates', async () => {
      const departure = await createSegmentDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({ name: '待定段' })
        .expect(201)

      expect(response.body.data).toMatchObject({
        name: '待定段',
        sortOrder: 0,
        startDate: null,
        endDate: null,
        dayCount: null,
        destination: null,
      })
    })

    it('appends sortOrder for subsequent segments', async () => {
      const departure = await createSegmentDeparture()

      const first = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({ name: '第一段' })
        .expect(201)

      const second = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({ name: '第二段' })
        .expect(201)

      expect(first.body.data.sortOrder).toBe(0)
      expect(second.body.data.sortOrder).toBe(1)
    })

    it('clears segment dates with explicit null', async () => {
      const departure = await createSegmentDeparture()

      const created = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send(segmentPayload())
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .patch(`/api/segments/${created.body.data.id}`)
        .send({ startDate: null, endDate: null })
        .expect(200)

      expect(response.body.data).toMatchObject({
        startDate: null,
        endDate: null,
        dayCount: null,
      })
    })

    it('returns 400 when only one date is provided', async () => {
      const departure = await createSegmentDeparture()

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({ name: '半边日期', startDate: '2026-08-01' })
        .expect(400)

      expect(response.body.message).toBe('开始日期与结束日期须同时填写或同时清空')
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
      expect(typeof hotel.body.data.createdAt).toBe('string')
      expect(typeof hotel.body.data.updatedAt).toBe('string')
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

    it('creates outsource resources with travel-agency supplier (category containment)', async () => {
      const segmentId = await createResourceSegment()
      const travelAgency = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-outsource-agency`,
          categories: [ResourceKind.outsource],
          status: DirectoryProfileStatus.active,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentId}/resources`)
        .send({
          resourceKind: ResourceKind.outsource,
          supplierId: travelAgency.id,
          title: '拼出阿勒泰',
          amountCents: 150000,
        })
        .expect(201)

      expect(response.body.data).toMatchObject({
        resourceKind: ResourceKind.outsource,
        supplierId: travelAgency.id,
        partnerId: null,
        counterpartyType: CounterpartyType.supplier,
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
        verifiedReceivableCents: 0,
        openUnsettledReceivableCents: 0,
        verifiedPayableCents: 0,
        openUnsettledPayableCents: 0,
        unverifiedIncomeCents: 0,
        unverifiedExpenseCents: 0,
        isFinanciallySettled: false,
      })
      expect(response.body.data.completionTags).toMatchObject({
        sourceOrders: '客源1单',
        segments: '行程1段',
        resources: '资源1项',
        receivables: '应收未生成',
        payables: '应付未生成',
      })
      expect(response.body.data.overviewStats).toEqual({
        receivedCents: 0,
        openUnreceivedCents: 0,
        closedUnreceivedCents: 0,
        ungeneratedReceivableCents: 1000000,
        otherReceivableCents: 0,
        settlementCollectionReceivedCents: 0,
        settlementCollectionReceivableCents: 1000000,
        guestCollectionReceivedCents: 0,
        guestCollectionAgreedCents: 1000000,
        estimatedRebateCents: 0,
        confirmedRebateCents: 0,
        rebatePaidCents: 0,
        rebateUnpaidCents: 0,
        confirmedPayableCents: 0,
        paidCents: 0,
        resourcePaidCents: 0,
        openUnpaidCents: 0,
        closedUnpaidCents: 0,
        ungeneratedPayableCents: 360000,
        otherPayableCents: 0,
        resourcePayableDifferenceCents: 0,
        confirmedMarginCents: 1000000,
        incomeTransactionCents: 0,
        expenseTransactionCents: 0,
        cashNetInflowCents: 0,
        unverifiedIncomeCents: 0,
        unverifiedExpenseCents: 0,
        verifiedFromExternalCents: 0,
        verifiedToOtherDeparturesCents: 0,
        anomalies: [],
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

      expect(response.body.data.verifiedReceivableCents).toBe(500000)
      expect(response.body.data.openUnsettledReceivableCents).toBe(500000)
      expect(response.body.data.completionTags.receivables).toBe('应收已生成')
      expect(response.body.data.isFinanciallySettled).toBe(false)
      expect(response.body.data.overviewStats).toMatchObject({
        receivedCents: 500000,
        openUnreceivedCents: 500000,
        closedUnreceivedCents: 0,
        ungeneratedReceivableCents: 0,
        otherReceivableCents: 0,
        settlementCollectionReceivedCents: 500000,
        settlementCollectionReceivableCents: 1000000,
        guestCollectionReceivedCents: 500000,
        guestCollectionAgreedCents: 1000000,
        estimatedRebateCents: 0,
        incomeTransactionCents: 500000,
        expenseTransactionCents: 0,
        cashNetInflowCents: 500000,
        unverifiedIncomeCents: 0,
        anomalies: [],
      })
    })

    it('splits settlement vs guest collection progress and caps tour progress when G>S', async () => {
      const departure = await createReadModelDeparture('-dual-progress')
      const sourceOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: rmPartnerId,
          adultGuestCount: 5,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
          depositCents: 200000,
          balanceCents: 400000,
        })
        .expect(201)

      // S=500000, G约定=600000 → 预估返利 100000
      expect(sourceOrder.body.data.netReceivableCents).toBe(500000)
      expect(sourceOrder.body.data.guestCollectCents).toBe(600000)

      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const schedules = generated.body.data.schedules as Array<{ id: string; amountCents: number }>
      expect(schedules).toHaveLength(2)

      for (const schedule of schedules) {
        await authRequest(app, financeToken)
          .post(`/api/finance/receivables/${schedule.id}/confirm-collection`)
          .send({
            amountCents: schedule.amountCents,
            transactionDate: '2026-08-01',
            paymentChannel: PaymentChannel.OTHER,
            counterpartyType: CounterpartyType.guest,
            counterpartyName: sourceOrder.body.data.displayName,
          })
          .expect(201)
      }

      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.body.data.id}/settle-by-actual-collection`)
        .send({})
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(response.body.data.overviewStats).toMatchObject({
        settlementCollectionReceivedCents: 500000,
        settlementCollectionReceivableCents: 500000,
        guestCollectionReceivedCents: 600000,
        guestCollectionAgreedCents: 600000,
        estimatedRebateCents: 100000,
        confirmedRebateCents: 100000,
        rebatePaidCents: 0,
        rebateUnpaidCents: 100000,
      })
      // 路径已收合计含溢价，但团款进度分子不超过 S
      expect(response.body.data.overviewStats.receivedCents).toBe(600000)
      expect(
        response.body.data.overviewStats.settlementCollectionReceivedCents,
      ).toBeLessThanOrEqual(
        response.body.data.overviewStats.settlementCollectionReceivableCents,
      )
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
      expect(detail.body.data.verifiedReceivableCents).toBe(1000000)
      expect(detail.body.data.openUnsettledReceivableCents).toBe(0)
      expect(detail.body.data.verifiedPayableCents).toBe(360000)
      expect(detail.body.data.openUnsettledPayableCents).toBe(0)
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 1000000,
        openUnreceivedCents: 0,
        confirmedPayableCents: 360000,
        paidCents: 360000,
        resourcePaidCents: 360000,
        openUnpaidCents: 0,
        closedUnpaidCents: 0,
        ungeneratedPayableCents: 0,
        confirmedMarginCents: 640000,
        incomeTransactionCents: 1000000,
        expenseTransactionCents: 360000,
        cashNetInflowCents: 640000,
        anomalies: [],
      })
    })

    it('keeps closed balances, manual obligations, and voided payables in their overview buckets', async () => {
      const departure = await createReadModelDeparture('-overview-buckets')
      const seeded = await seedDepartureData(departure.id)

      const receivable = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const receivableScheduleId = receivable.body.data.schedules[0].id as string
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivableScheduleId}/confirm-collection`)
        .send({
          amountCents: 400000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.CASH,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${receivableScheduleId}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '剩余应收线下处理' })
        .expect(201)

      const voidedPayable = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${seeded.resourceId}/generate-payable`)
        .expect(201)
      // ADR-0023: 资源应付作废归 departure:write（计调），财务无权。
      await authRequest(app, coordinatorToken)
        .post(
          `/api/finance/payment-schedules/${voidedPayable.body.data.schedule.id}/void-resource-payable`,
        )
        .send({ voidReason: '误生成' })
        .expect(201)

      await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send({
          departureId: departure.id,
          title: '其他应收',
          amountCents: 70000,
          dueDate: '2026-08-10',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: rmPartnerId,
          counterpartyName: `${testPrefix}-rm-partner`,
        })
        .expect(201)
      const manualPayable = await authRequest(app, financeToken)
        .post('/api/finance/payables')
        .send({
          departureId: departure.id,
          title: '其他应付',
          amountCents: 50000,
          dueDate: '2026-08-10',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: rmSupplierId,
          counterpartyName: `${testPrefix}-rm-supplier`,
        })
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${manualPayable.body.data.id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '其他应付线下处理' })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 400000,
        openUnreceivedCents: 0,
        closedUnreceivedCents: 600000,
        ungeneratedReceivableCents: 0,
        otherReceivableCents: 70000,
        confirmedPayableCents: 50000,
        paidCents: 0,
        resourcePaidCents: 0,
        openUnpaidCents: 0,
        closedUnpaidCents: 50000,
        ungeneratedPayableCents: 360000,
        otherPayableCents: 50000,
        resourcePayableDifferenceCents: 0,
        anomalies: [],
      })
      expect(detail.body.data.verifiedReceivableCents).toBe(400000)
      expect(detail.body.data.openUnsettledReceivableCents).toBe(70000)
      expect(detail.body.data.verifiedPayableCents).toBe(0)
      expect(detail.body.data.openUnsettledPayableCents).toBe(0)
    })

    it('moves cancelled verification back to unreceived and unverified cash', async () => {
      const departure = await createReadModelDeparture('-overview-revoke')
      const seeded = await seedDepartureData(departure.id)
      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const schedule = generated.body.data.schedules[0]

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${schedule.id}/confirm-collection`)
        .send({
          amountCents: 300000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.CASH,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)
      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: schedule.scheduleNo, scheduleNoMatch: 'exact' })
        .expect(200)
      await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
        .send({ cancelReason: '测试撤销核销' })
        .expect(201)

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 0,
        openUnreceivedCents: 1000000,
        incomeTransactionCents: 300000,
        cashNetInflowCents: 300000,
        unverifiedIncomeCents: 300000,
        anomalies: [],
      })
    })

    it('reports both directions of cross-departure verification without moving cash ownership', async () => {
      const scheduleDeparture = await createReadModelDeparture('-overview-cross-schedule')
      const cashDeparture = await createReadModelDeparture('-overview-cross-cash')
      const sourceOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${scheduleDeparture.id}/source-orders`)
        .send({
          partnerId: rmPartnerId,
          adultGuestCount: 3,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
        })
        .expect(201)
      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
        .expect(201)
      // 发团硬筛：现金侧发团也需挂上同伙伴源事实，流水才能关联该发团。
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${cashDeparture.id}/source-orders`)
        .send({
          partnerId: rmPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 1000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
        })
        .expect(201)
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 300000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: rmPartnerId,
          counterpartyName: `${testPrefix}-rm-partner`,
          departureId: cashDeparture.id,
        })
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${generated.body.data.schedules[0].id}/link-transaction`)
        .send({ transactionId: transaction.body.data.id, amountCents: 200000 })
        .expect(201)

      const scheduleDetail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${scheduleDeparture.id}`)
        .expect(200)
      const cashDetail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${cashDeparture.id}`)
        .expect(200)

      expect(scheduleDetail.body.data.overviewStats).toMatchObject({
        receivedCents: 200000,
        incomeTransactionCents: 0,
        cashNetInflowCents: 0,
        verifiedFromExternalCents: 200000,
        verifiedToOtherDeparturesCents: 0,
      })
      expect(cashDetail.body.data.overviewStats).toMatchObject({
        receivedCents: 0,
        incomeTransactionCents: 300000,
        cashNetInflowCents: 300000,
        unverifiedIncomeCents: 100000,
        verifiedFromExternalCents: 0,
        verifiedToOtherDeparturesCents: 200000,
      })
    })

    it('counts verification from an unattributed transaction as external cash', async () => {
      const departure = await createReadModelDeparture('-overview-unattributed')
      const seeded = await seedDepartureData(departure.id)
      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 300000,
          transactionDate: '2026-08-01',
          counterpartyType: CounterpartyType.guest,
          counterpartyId: seeded.sourceOrderId,
          counterpartyName: seeded.displayName,
          departureId: departure.id,
        })
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${generated.body.data.schedules[0].id}/link-transaction`)
        .send({ transactionId: transaction.body.data.id, amountCents: 200000 })
        .expect(201)
      // 写入侧已强制流水必须归属发团；无归属流水只可能是存量数据，直接改库模拟。
      await prisma.financeTransaction.update({
        where: { id: transaction.body.data.id },
        data: { departureId: null },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)

      // 无归属发团的流水不进本团资金卡，其核销与他团流水合并为「核销自外部流水」。
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 200000,
        incomeTransactionCents: 0,
        cashNetInflowCents: 0,
        verifiedFromExternalCents: 200000,
        verifiedToOtherDeparturesCents: 0,
      })
    })

    it('returns signed reconciliation facts and a structured anomaly instead of masking bad data', async () => {
      const departure = await createReadModelDeparture('-overview-anomaly')
      const seeded = await seedDepartureData(departure.id)
      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      const scheduleId = generated.body.data.schedules[0].id as string
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
        .send({
          amountCents: 1000000,
          transactionDate: '2026-08-01',
          paymentChannel: PaymentChannel.CASH,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: seeded.displayName,
        })
        .expect(201)

      // Simulate legacy-corrupt data that write-path invariants would reject.
      await prisma.paymentSchedule.update({
        where: { id: scheduleId },
        data: { amountCents: 900000 },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 1000000,
        openUnreceivedCents: -100000,
        ungeneratedReceivableCents: 0,
        anomalies: [
          {
            code: 'receivable_balance',
            expectedCents: 1000000,
            actualCents: 900000,
            differenceCents: -100000,
          },
        ],
      })
    })

    it('preserves a signed ungenerated source-path amount from legacy-corrupt data', async () => {
      const departure = await createReadModelDeparture('-overview-negative-source')
      const seeded = await seedDepartureData(departure.id)
      // guest_only 未生成口径按定金/尾款路径；模拟路径金额与 S 一同腐坏。
      await prisma.sourceOrder.update({
        where: { id: seeded.sourceOrderId },
        data: {
          depositCents: 0,
          balanceCents: -100000,
          guestCollectCents: -100000,
          netReceivableCents: -100000,
          grossReceivableCents: -100000,
        },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 0,
        openUnreceivedCents: 0,
        closedUnreceivedCents: 0,
        ungeneratedReceivableCents: -100000,
        confirmedMarginCents: -100000,
        anomalies: [],
      })
    })

    it('does not misclassify a generated path after its source amount becomes negative', async () => {
      const departure = await createReadModelDeparture('-overview-negative-generated')
      const seeded = await seedDepartureData(departure.id)
      await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${seeded.sourceOrderId}/generate-receivables`)
        .expect(201)
      await prisma.sourceOrder.update({
        where: { id: seeded.sourceOrderId },
        data: {
          guestCollectCents: -100000,
          netReceivableCents: -100000,
          grossReceivableCents: -100000,
        },
      })

      const detail = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}`)
        .expect(200)
      expect(detail.body.data.overviewStats).toMatchObject({
        receivedCents: 0,
        openUnreceivedCents: 1000000,
        ungeneratedReceivableCents: 0,
        anomalies: [
          {
            code: 'receivable_balance',
            expectedCents: -100000,
            actualCents: 1000000,
            differenceCents: 1100000,
          },
        ],
      })
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

  describe('Operations sheet (issue #95)', () => {
    let opsPartnerId: string
    let opsSupplierId: string

    beforeAll(async () => {
      const partner = await prisma.partner.create({
        data: {
          organizationId,
          name: `${testPrefix}-ops-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })
      opsPartnerId = partner.id

      const supplier = await prisma.supplier.create({
        data: {
          organizationId,
          name: `${testPrefix}-ops-supplier`,
          categories: [
            ResourceKind.hotel,
            ResourceKind.meal,
            ResourceKind.transport,
            ResourceKind.guide,
            ResourceKind.outsource,
          ],
          status: DirectoryProfileStatus.active,
        },
      })
      opsSupplierId = supplier.id
    })

    async function createOpsDeparture(overrides: Record<string, unknown> = {}) {
      return createTestDeparture({
        name: `${testPrefix}-ops-sheet`,
        notes: '发团级备注应单独归属',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        ...overrides,
      })
    }

    it('returns finance-not-started snapshot with guest representative, stable resource order, and dash progress', async () => {
      const departure = await createOpsDeparture()

      const laterSourceOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 2,
          childGuestCount: 1,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 80000,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
          notes: '后建客源备注',
          settlementNotes: '后建结算备注',
        })
        .expect(201)

      await new Promise((resolve) => setTimeout(resolve, 20))

      const earlierSourceOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 4,
          childGuestCount: 0,
          adultUnitPriceCents: 120000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          notes: '先建客源备注',
        })
        .expect(201)

      // createdAt on API path is nearly simultaneous; force ordering for guest-rep + source-order order.
      await prisma.sourceOrder.update({
        where: { id: earlierSourceOrder.body.data.id },
        data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      })
      await prisma.sourceOrder.update({
        where: { id: laterSourceOrder.body.data.id },
        data: { createdAt: new Date('2026-01-02T00:00:00.000Z') },
      })

      const laterGuest = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${earlierSourceOrder.body.data.id}/guests`)
        .send({ name: '后建客人', phone: '13900000002' })
        .expect(201)

      const earlierGuest = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${earlierSourceOrder.body.data.id}/guests`)
        .send({ name: '最早客人', phone: '13800000001' })
        .expect(201)

      await prisma.sourceOrderGuest.update({
        where: { id: earlierGuest.body.data.id },
        data: { createdAt: new Date('2026-01-01T08:00:00.000Z') },
      })
      await prisma.sourceOrderGuest.update({
        where: { id: laterGuest.body.data.id },
        data: { createdAt: new Date('2026-01-01T09:00:00.000Z') },
      })

      const segmentA = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '阿勒泰段',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          destination: '阿勒泰',
          notes: '段备注A',
        })
        .expect(201)

      const segmentB = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '喀纳斯段',
          startDate: '2026-09-03',
          endDate: '2026-09-05',
          destination: '喀纳斯',
        })
        .expect(201)

      // Insert out of kind order to assert stable kind → title → counterparty sort.
      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.meal,
          supplierId: opsSupplierId,
          title: '晚餐',
          amountCents: 30000,
          notes: '餐备注',
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '酒店B',
          amountCents: 80000,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '酒店A',
          amountCents: 90000,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentA.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.outsource,
          supplierId: opsSupplierId,
          title: '拼出阿勒泰',
          amountCents: 150000,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segmentB.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.transport,
          supplierId: opsSupplierId,
          title: '用车',
          amountCents: 200000,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      const sheet = response.body.data
      expect(sheet.organizationName).toEqual(expect.any(String))
      expect(sheet.exportedAt).toEqual(expect.any(String))
      expect(sheet.exportedByName).toEqual(expect.any(String))
      expect(sheet.dataStage).toBe('not_started')
      expect(sheet.departure).toMatchObject({
        id: departure.id,
        departureNo: departure.departureNo,
        name: `${testPrefix}-ops-sheet`,
        routeName: '喀纳斯阿勒泰10日线',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        dayCount: 5,
        status: DepartureStatus.editing,
        notes: '发团级备注应单独归属',
      })
      expect(sheet.departure.ownerName).toBeTruthy()
      expect(sheet.departure.departureProgress).toBeTruthy()

      expect(sheet.sourceOrders).toHaveLength(2)
      expect(sheet.sourceOrders[0].id).toBe(earlierSourceOrder.body.data.id)
      expect(sheet.sourceOrders[0]).toMatchObject({
        partnerName: `${testPrefix}-ops-partner`,
        adultGuestCount: 4,
        childGuestCount: 0,
        guestCount: 4,
        fareAdjustmentNetCents: 0,
        agreedReceivableCents: 480000,
        notes: '先建客源备注',
        settlementNotes: null,
        guestRepresentative: { name: '最早客人', phone: '13800000001' },
        receivablePaths: [
          {
            pathType: 'source_order_customer_settlement',
            pathLabel: '客户结算',
            agreedReceivableCents: 480000,
            scheduleReceivableCents: null,
            receivedCents: null,
            unreceivedCents: null,
            receivableStatus: 'not_generated',
            needsReview: false,
            excludeFromProgressTotals: false,
          },
        ],
      })
      expect(sheet.sourceOrders[1]).toMatchObject({
        id: laterSourceOrder.body.data.id,
        adultGuestCount: 2,
        childGuestCount: 1,
        guestCount: 3,
        fareAdjustmentNetCents: 0,
        agreedReceivableCents: 280000,
        notes: '后建客源备注',
        settlementNotes: '后建结算备注',
        guestRepresentative: null,
        receivablePaths: [
          {
            pathType: 'source_order_guest_balance_collection',
            pathLabel: '尾款代收',
            agreedReceivableCents: 280000,
            scheduleReceivableCents: null,
            receivedCents: null,
            unreceivedCents: null,
            receivableStatus: 'not_generated',
            needsReview: false,
            excludeFromProgressTotals: false,
          },
        ],
      })

      expect(sheet.segments.map((s: { name: string }) => s.name)).toEqual(['阿勒泰段', '喀纳斯段'])
      expect(sheet.segments[0]).toMatchObject({
        name: '阿勒泰段',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        dayCount: 2,
        destination: '阿勒泰',
        notes: '段备注A',
      })

      const resourceTitles = sheet.segments[0].resources.map((r: { title: string; resourceKind: string }) => ({
        kind: r.resourceKind,
        title: r.title,
      }))
      expect(resourceTitles).toEqual([
        { kind: ResourceKind.hotel, title: '酒店A' },
        { kind: ResourceKind.hotel, title: '酒店B' },
        { kind: ResourceKind.meal, title: '晚餐' },
        { kind: ResourceKind.outsource, title: '拼出阿勒泰' },
      ])

      for (const resource of sheet.segments[0].resources) {
        expect(resource.paidCents).toBeNull()
        expect(resource.unpaidCents).toBeNull()
        expect(resource.schedulePayableCents).toBeNull()
        expect(resource.payableStatus).toBe('not_generated')
        expect(resource.needsReview).toBe(false)
        expect(resource.agreedPayableCents).toEqual(expect.any(Number))
      }
      expect(sheet.segments[0].resources.find((r: { title: string }) => r.title === '晚餐')).toMatchObject({
        notes: '餐备注',
        counterpartyName: `${testPrefix}-ops-supplier`,
        paidCents: null,
        unpaidCents: null,
        schedulePayableCents: null,
        payableStatus: 'not_generated',
        needsReview: false,
      })
      expect(sheet.segments[1].resources).toEqual([
        expect.objectContaining({
          resourceKind: ResourceKind.transport,
          title: '用车',
          agreedPayableCents: 200000,
          paidCents: null,
          unpaidCents: null,
          schedulePayableCents: null,
          payableStatus: 'not_generated',
          needsReview: false,
        }),
      ])

      // Finance not started: empty pending / summary / anomalies must not fake zeros (#98).
      expect(sheet.pendingTransactions).toEqual([])
      expect(sheet.pendingSummary).toBeNull()
      expect(sheet.financeSummary).toEqual({ receivable: null, payable: null })
      expect(sheet.anomalies).toEqual([])
    })

    it('exposes fareAdjustmentNetCents on source main row in preview and xlsx without kind detail (#178)', async () => {
      const ExcelJS = await import('exceljs')
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-fare-adj` })
      const customName = '旺季加价-运营表勿展开'

      // 原始 1000 + 调整净额 150（单房差 200 + 自定义 50 − 老人免 100）= 约定应收 1150（元）
      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          fareAdjustments: [
            {
              kind: 'single_room_supplement',
              direction: 'increase',
              amountCents: 20000,
            },
            {
              kind: 'custom',
              direction: 'increase',
              amountCents: 5000,
              customName,
            },
            {
              kind: 'senior_free_ticket_pre_discounted',
              direction: 'decrease',
              amountCents: 10000,
            },
          ],
        })
        .expect(201)

      const preview = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      expect(preview.body.data.sourceOrders).toHaveLength(1)
      expect(preview.body.data.sourceOrders[0]).toMatchObject({
        fareAdjustmentNetCents: 15000,
        agreedReceivableCents: 115000,
      })
      expect(preview.body.data.sourceOrders[0]).not.toHaveProperty('fareAdjustments')
      expect(JSON.stringify(preview.body.data)).not.toContain(customName)
      expect(JSON.stringify(preview.body.data)).not.toContain('single_room_supplement')

      const xlsxResponse = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet.xlsx`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => callback(null, Buffer.concat(chunks)))
        })
        .expect(200)

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(xlsxResponse.body as any)
      const worksheet = workbook.worksheets[0]

      let sourceHeaderRow = 0
      worksheet.eachRow((row, rowNumber) => {
        if (row.getCell(1).value === '合作方' && row.getCell(4).value === '调整净额') {
          sourceHeaderRow = rowNumber
        }
      })
      expect(sourceHeaderRow).toBeGreaterThan(0)
      // 金额列为元：调整净额 150、约定应收 1150
      expect(worksheet.getRow(sourceHeaderRow + 1).getCell(4).value).toBe(150)
      expect(worksheet.getRow(sourceHeaderRow + 1).getCell(5).value).toBe(1150)

      const cellTexts: string[] = []
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            cellTexts.push(text)
          }
        })
      })
      expect(cellTexts).toContain('调整净额')
      expect(cellTexts).not.toContain(customName)
      expect(cellTexts).not.toContain('单房差')
      expect(cellTexts).not.toContain('老人免票或半价已优惠过')
    })

    it('wires resource payable progress from finance facade (#96)', async () => {
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-payable-progress` })

      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '进度段',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          destination: '阿勒泰',
        })
        .expect(201)

      // Insert out of kind order — sheet must still sort hotel → meal → transport → outsource.
      const meal = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.meal,
          supplierId: opsSupplierId,
          title: '未生成餐',
          amountCents: 20000,
        })
        .expect(201)

      const hotelPartial = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '部分付款酒店',
          amountCents: 100000,
        })
        .expect(201)

      const hotelPending = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '待付酒店',
          amountCents: 60000,
        })
        .expect(201)

      const transportPaid = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.transport,
          supplierId: opsSupplierId,
          title: '已付清用车',
          amountCents: 50000,
        })
        .expect(201)

      const hotelClosed = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '关闭仍未付酒店',
          amountCents: 80000,
        })
        .expect(201)

      const hotelMismatch = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '金额不一致酒店',
          amountCents: 120000,
        })
        .expect(201)

      const generatedPartial = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelPartial.body.data.id}/generate-payable`)
        .expect(201)
      await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelPending.body.data.id}/generate-payable`)
        .expect(201)
      const generatedPaid = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${transportPaid.body.data.id}/generate-payable`)
        .expect(201)
      const generatedClosed = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelClosed.body.data.id}/generate-payable`)
        .expect(201)
      const generatedMismatch = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelMismatch.body.data.id}/generate-payable`)
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${generatedPartial.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 40000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${generatedPaid.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 50000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${generatedClosed.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 30000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${generatedClosed.body.data.schedule.id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '供应商纠纷内部备注勿导出' })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${generatedMismatch.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 10000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      // Simulate business/schedule divergence after finance touch (same seam as payables e2e).
      await prisma.segmentResource.update({
        where: { id: hotelMismatch.body.data.id },
        data: { amountCents: 120000 },
      })
      await prisma.paymentSchedule.update({
        where: { id: generatedMismatch.body.data.schedule.id },
        data: { amountCents: 90000 },
      })

      // Unallocated outflow must not count as paid on the meal resource.
      await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'outflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 99900,
          transactionDate: '2026-09-01',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
          departureId: departure.id,
          notes: '未核销支出不应计入已付',
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      const sheet = response.body.data
      expect(sheet.dataStage).toBe('partial')

      const resources = sheet.segments[0].resources as Array<{
        id: string
        title: string
        resourceKind: string
        agreedPayableCents: number
        schedulePayableCents: number | null
        paidCents: number | null
        unpaidCents: number | null
        payableStatus: string
        needsReview: boolean
      }>

      expect(resources.map((r) => ({ kind: r.resourceKind, title: r.title }))).toEqual([
        { kind: ResourceKind.transport, title: '已付清用车' },
        { kind: ResourceKind.hotel, title: '部分付款酒店' },
        { kind: ResourceKind.hotel, title: '待付酒店' },
        { kind: ResourceKind.hotel, title: '关闭仍未付酒店' },
        { kind: ResourceKind.hotel, title: '金额不一致酒店' },
        { kind: ResourceKind.meal, title: '未生成餐' },
      ])

      const byTitle = Object.fromEntries(resources.map((r) => [r.title, r]))

      expect(byTitle['未生成餐']).toMatchObject({
        id: meal.body.data.id,
        agreedPayableCents: 20000,
        schedulePayableCents: null,
        paidCents: null,
        unpaidCents: null,
        payableStatus: 'not_generated',
        needsReview: false,
        excludeFromProgressTotals: false,
      })

      expect(byTitle['待付酒店']).toMatchObject({
        id: hotelPending.body.data.id,
        agreedPayableCents: 60000,
        schedulePayableCents: 60000,
        paidCents: 0,
        unpaidCents: 60000,
        payableStatus: 'pending',
        needsReview: false,
        excludeFromProgressTotals: false,
      })

      expect(byTitle['部分付款酒店']).toMatchObject({
        id: hotelPartial.body.data.id,
        agreedPayableCents: 100000,
        schedulePayableCents: 100000,
        paidCents: 40000,
        unpaidCents: 60000,
        payableStatus: 'partial',
        needsReview: false,
        excludeFromProgressTotals: false,
      })

      expect(byTitle['已付清用车']).toMatchObject({
        id: transportPaid.body.data.id,
        agreedPayableCents: 50000,
        schedulePayableCents: 50000,
        paidCents: 50000,
        unpaidCents: 0,
        payableStatus: 'paid',
        needsReview: false,
        excludeFromProgressTotals: false,
      })

      expect(byTitle['关闭仍未付酒店']).toMatchObject({
        id: hotelClosed.body.data.id,
        agreedPayableCents: 80000,
        schedulePayableCents: 80000,
        paidCents: 30000,
        unpaidCents: 50000,
        payableStatus: 'closed',
        needsReview: true,
        excludeFromProgressTotals: false,
      })
      expect(JSON.stringify(byTitle['关闭仍未付酒店'])).not.toContain('供应商纠纷')

      expect(byTitle['金额不一致酒店']).toMatchObject({
        id: hotelMismatch.body.data.id,
        agreedPayableCents: 120000,
        schedulePayableCents: 90000,
        paidCents: 10000,
        unpaidCents: 80000,
        payableStatus: 'partial',
        needsReview: true,
        excludeFromProgressTotals: true,
      })
    })

    it('wires source-order receivable path progress from finance facade (#97)', async () => {
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-receivable-progress` })

      // Split: only balance Guest receivable — generate and partial collect.
      const splitOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 2,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.split,
          depositCents: 120000,
          balanceCents: 80000,
        })
        .expect(201)

      // Guest-only: generate and fully collect.
      const collectedOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 50000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      // Partner-settled: generate, partial collect, then close with balance.
      const closedOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 80000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
        })
        .expect(201)

      // Guest-only: generate then diverge business vs schedule amount after finance touch.
      const mismatchOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 120000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      // Guest-only: leave ungenerated so dash progress coexists with generated paths.
      const ungeneratedOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 30000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const splitGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${splitOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const collectedGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${collectedOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const closedGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${closedOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const mismatchGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${mismatchOrder.body.data.id}/generate-receivables`)
        .expect(201)

      const splitSchedules = splitGenerated.body.data.schedules as Array<{
        id: string
        sourceType: string
        amountCents: number
      }>
      expect(splitSchedules).toHaveLength(1)
      const guestSchedule = splitSchedules.find(
        (s) => s.sourceType === 'source_order_guest_balance_collection',
      )
      expect(guestSchedule).toBeTruthy()

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${guestSchedule!.id}/confirm-collection`)
        .send({
          amountCents: 40000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: splitOrder.body.data.id,
          counterpartyName: splitOrder.body.data.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${collectedGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 50000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: collectedOrder.body.data.id,
          counterpartyName: collectedOrder.body.data.displayName,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${closedGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 30000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${closedGenerated.body.data.schedules[0].id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '坏账内部备注勿导出' })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${mismatchGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 10000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: mismatchOrder.body.data.id,
          counterpartyName: mismatchOrder.body.data.displayName,
        })
        .expect(201)

      await prisma.paymentSchedule.update({
        where: { id: mismatchGenerated.body.data.schedules[0].id },
        data: { amountCents: 90000 },
      })

      // Unallocated inflow must not count as received on any receivable path.
      await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 88800,
          transactionDate: '2026-09-01',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
          departureId: departure.id,
          notes: '未核销收入不应计入已收',
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      const sheet = response.body.data
      expect(sheet.dataStage).toBe('partial')

      type PathRow = {
        pathType: string
        pathLabel: string
        agreedReceivableCents: number
        scheduleReceivableCents: number | null
        receivedCents: number | null
        unreceivedCents: number | null
        receivableStatus: string
        needsReview: boolean
        excludeFromProgressTotals: boolean
      }
      type OrderRow = {
        id: string
        agreedReceivableCents: number
        receivablePaths: PathRow[]
      }

      const orders = sheet.sourceOrders as OrderRow[]
      const byId = Object.fromEntries(orders.map((o) => [o.id, o]))

      expect(byId[ungeneratedOrder.body.data.id]).toMatchObject({
        agreedReceivableCents: 30000,
        receivablePaths: [
          {
            pathType: 'source_order_guest_balance_collection',
            pathLabel: '尾款代收',
            agreedReceivableCents: 30000,
            scheduleReceivableCents: null,
            receivedCents: null,
            unreceivedCents: null,
            receivableStatus: 'not_generated',
            needsReview: false,
            excludeFromProgressTotals: false,
          },
        ],
      })

      expect(byId[splitOrder.body.data.id].receivablePaths).toEqual([
        expect.objectContaining({
          pathType: 'source_order_guest_balance_collection',
          pathLabel: '尾款代收',
          agreedReceivableCents: 80000,
          scheduleReceivableCents: 80000,
          receivedCents: 40000,
          unreceivedCents: 40000,
          receivableStatus: 'partial',
          needsReview: false,
          excludeFromProgressTotals: false,
        }),
      ])

      expect(byId[collectedOrder.body.data.id].receivablePaths).toEqual([
        expect.objectContaining({
          pathType: 'source_order_guest_balance_collection',
          pathLabel: '尾款代收',
          agreedReceivableCents: 50000,
          scheduleReceivableCents: 50000,
          receivedCents: 50000,
          unreceivedCents: 0,
          receivableStatus: 'collected',
          needsReview: false,
          excludeFromProgressTotals: false,
        }),
      ])

      expect(byId[closedOrder.body.data.id].receivablePaths).toEqual([
        expect.objectContaining({
          pathType: 'source_order_customer_settlement',
          pathLabel: '客户结算',
          agreedReceivableCents: 80000,
          scheduleReceivableCents: 80000,
          receivedCents: 30000,
          unreceivedCents: 50000,
          receivableStatus: 'closed',
          needsReview: true,
          excludeFromProgressTotals: false,
        }),
      ])
      expect(JSON.stringify(byId[closedOrder.body.data.id])).not.toContain('坏账')

      expect(byId[mismatchOrder.body.data.id].receivablePaths).toEqual([
        expect.objectContaining({
          pathType: 'source_order_guest_balance_collection',
          pathLabel: '尾款代收',
          agreedReceivableCents: 120000,
          scheduleReceivableCents: 90000,
          receivedCents: 10000,
          unreceivedCents: 80000,
          receivableStatus: 'partial',
          needsReview: true,
          excludeFromProgressTotals: true,
        }),
      ])
    })

    it('assembles pending transactions, normal totals and anomalies (#98)', async () => {
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-pending-summary` })

      const partialOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
        })
        .expect(201)

      const closedOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 80000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
        })
        .expect(201)

      const mismatchOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 120000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const ungeneratedOrder = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 30000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(201)

      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '汇总段',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          destination: '阿勒泰',
        })
        .expect(201)

      const hotelPartial = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '部分付款酒店',
          amountCents: 100000,
        })
        .expect(201)

      const hotelClosed = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '关闭仍未付酒店',
          amountCents: 80000,
        })
        .expect(201)

      const hotelMismatch = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '金额不一致酒店',
          amountCents: 120000,
        })
        .expect(201)

      const mealUngenerated = await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.meal,
          supplierId: opsSupplierId,
          title: '未生成餐',
          amountCents: 20000,
        })
        .expect(201)

      const partialGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${partialOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const closedGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${closedOrder.body.data.id}/generate-receivables`)
        .expect(201)
      const mismatchGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${mismatchOrder.body.data.id}/generate-receivables`)
        .expect(201)

      const hotelPartialGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelPartial.body.data.id}/generate-payable`)
        .expect(201)
      const hotelClosedGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelClosed.body.data.id}/generate-payable`)
        .expect(201)
      const hotelMismatchGenerated = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${hotelMismatch.body.data.id}/generate-payable`)
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${partialGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 40000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${closedGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 30000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${closedGenerated.body.data.schedules[0].id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '坏账内部备注勿导出' })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${mismatchGenerated.body.data.schedules[0].id}/confirm-collection`)
        .send({
          amountCents: 10000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: mismatchOrder.body.data.id,
          counterpartyName: mismatchOrder.body.data.displayName,
        })
        .expect(201)

      await prisma.paymentSchedule.update({
        where: { id: mismatchGenerated.body.data.schedules[0].id },
        data: { amountCents: 90000 },
      })

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${hotelPartialGenerated.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 40000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${hotelClosedGenerated.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 30000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${hotelClosedGenerated.body.data.schedule.id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '供应商纠纷内部备注勿导出' })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${hotelMismatchGenerated.body.data.schedule.id}/confirm-payment`)
        .send({
          amountCents: 10000,
          transactionDate: '2026-09-01',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
        })
        .expect(201)

      await prisma.segmentResource.update({
        where: { id: hotelMismatch.body.data.id },
        data: { amountCents: 120000 },
      })
      await prisma.paymentSchedule.update({
        where: { id: hotelMismatchGenerated.body.data.schedule.id },
        data: { amountCents: 90000 },
      })

      // Fully-unallocated inflow / outflow stay as pending cash facts.
      const pendingInflow = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 55000,
          transactionDate: '2026-09-02',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
          departureId: departure.id,
          notes: '待确认收款备注',
        })
        .expect(201)

      const pendingOutflow = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'outflow',
          paymentChannel: PaymentChannel.WECHAT,
          amountCents: 66000,
          transactionDate: '2026-09-03',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: opsSupplierId,
          counterpartyName: `${testPrefix}-ops-supplier`,
          departureId: departure.id,
          notes: '待确认付款备注',
        })
        .expect(201)

      // Partial verification: remaining unverified amount stays pending.
      const partialTx = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.ALIPAY,
          amountCents: 70000,
          transactionDate: '2026-09-04',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
          departureId: departure.id,
          notes: '部分核销后剩余待确认',
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(
          `/api/finance/receivables/${partialGenerated.body.data.schedules[0].id}/link-transaction`,
        )
        .send({ transactionId: partialTx.body.data.id, amountCents: 25000 })
        .expect(201)

      // Voided transaction must disappear from pending.
      const voidedTx = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 99000,
          transactionDate: '2026-09-05',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: opsPartnerId,
          counterpartyName: `${testPrefix}-ops-partner`,
          departureId: departure.id,
          notes: '作废流水不应出现',
        })
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${voidedTx.body.data.id}/void`)
        .send({ voidReason: '录入错误' })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      const sheet = response.body.data
      expect(sheet.dataStage).toBe('partial')

      // Pending: voided excluded; partial shows remaining only; totals stay cash-fact scoped.
      expect(sheet.pendingTransactions).toEqual([
        expect.objectContaining({
          id: pendingInflow.body.data.id,
          direction: 'inflow',
          transactionDate: '2026-09-02',
          counterpartyName: `${testPrefix}-ops-partner`,
          remainingUnverifiedCents: 55000,
          paymentChannel: PaymentChannel.CASH,
          notes: '待确认收款备注',
        }),
        expect.objectContaining({
          id: pendingOutflow.body.data.id,
          direction: 'outflow',
          transactionDate: '2026-09-03',
          counterpartyName: `${testPrefix}-ops-supplier`,
          remainingUnverifiedCents: 66000,
          paymentChannel: PaymentChannel.WECHAT,
          notes: '待确认付款备注',
        }),
        expect.objectContaining({
          id: partialTx.body.data.id,
          direction: 'inflow',
          transactionDate: '2026-09-04',
          remainingUnverifiedCents: 45000,
          paymentChannel: PaymentChannel.ALIPAY,
          notes: '部分核销后剩余待确认',
        }),
      ])
      expect(sheet.pendingTransactions.map((row: { id: string }) => row.id)).not.toContain(
        voidedTx.body.data.id,
      )
      expect(sheet.pendingSummary).toEqual({
        pendingCollectionCents: 100000,
        pendingPaymentCents: 66000,
      })

      // Normal totals: generated + amount-consistent only; ungenerated/mismatch excluded.
      // Receivable countable: partial (100k/65k/35k after extra 25k link) + closed (80k/30k/50k)
      // After link-transaction of 25000 onto partial schedule that already had 40000:
      // received=65000, unreceived=35000.
      expect(sheet.financeSummary.receivable).toEqual({
        agreedCents: 180000,
        settledCents: 95000,
        unsettledCents: 85000,
        includedRowCount: 2,
      })
      expect(sheet.financeSummary.payable).toEqual({
        agreedCents: 180000,
        settledCents: 70000,
        unsettledCents: 110000,
        includedRowCount: 2,
      })

      // Ungenerated rows stay visible but out of normal unsettled totals.
      const orders = sheet.sourceOrders as Array<{
        id: string
        receivablePaths: Array<{
          receivableStatus: string
          unreceivedCents: number | null
          needsReview: boolean
          excludeFromProgressTotals: boolean
        }>
      }>
      const ungenerated = orders.find((order) => order.id === ungeneratedOrder.body.data.id)
      expect(ungenerated?.receivablePaths[0]).toMatchObject({
        receivableStatus: 'not_generated',
        unreceivedCents: null,
      })
      const meal = sheet.segments[0].resources.find(
        (resource: { id: string }) => resource.id === mealUngenerated.body.data.id,
      )
      expect(meal).toMatchObject({
        payableStatus: 'not_generated',
        unpaidCents: null,
      })

      // Anomalies concentrate closed-with-balance and amount mismatch; main rows keep 需核对.
      expect(sheet.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'closed_with_balance',
            side: 'receivable',
            remainingCents: 50000,
          }),
          expect.objectContaining({
            kind: 'amount_mismatch',
            side: 'receivable',
            agreedAmountCents: 120000,
            scheduleAmountCents: 90000,
            remainingCents: 80000,
          }),
          expect.objectContaining({
            kind: 'closed_with_balance',
            side: 'payable',
            remainingCents: 50000,
          }),
          expect.objectContaining({
            kind: 'amount_mismatch',
            side: 'payable',
            agreedAmountCents: 120000,
            scheduleAmountCents: 90000,
            remainingCents: 80000,
          }),
        ]),
      )
      expect(sheet.anomalies).toHaveLength(4)

      const mismatchPath = orders.find((order) => order.id === mismatchOrder.body.data.id)
        ?.receivablePaths[0]
      expect(mismatchPath).toMatchObject({
        needsReview: true,
        excludeFromProgressTotals: true,
      })
      const closedPath = orders.find((order) => order.id === closedOrder.body.data.id)
        ?.receivablePaths[0]
      expect(closedPath).toMatchObject({
        needsReview: true,
        receivableStatus: 'closed',
      })

      const ExcelJS = await import('exceljs')
      const xlsxResponse = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet.xlsx`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => callback(null, Buffer.concat(chunks)))
        })
        .expect(200)

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(xlsxResponse.body as any)
      const cellTexts: string[] = []
      workbook.worksheets[0].eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            cellTexts.push(text)
          }
        })
      })
      expect(cellTexts).toContain('待确认款项')
      expect(cellTexts).toContain('财务汇总与异常')
      expect(cellTexts.some((text) => text.includes('需核对'))).toBe(true)
      expect(cellTexts).toContain('关闭仍有余额')
      // #100: anomaly rows carry explicit text markers (not color-only).
      expect(cellTexts.filter((text) => text.includes('需核对')).length).toBeGreaterThanOrEqual(2)

      const anomalySheet = workbook.worksheets[0]
      expect(anomalySheet.pageSetup.orientation).toBe('landscape')
      expect(anomalySheet.pageSetup.fitToWidth).toBe(1)
      expect(anomalySheet.pageSetup.fitToHeight).toBe(0)
      expect(anomalySheet.pageSetup.printTitlesRow).toMatch(/^\d+:\d+$/)
    })

    it('allows finance role to read operations sheet', async () => {
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-finance` })

      const response = await authRequest(app, financeToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      expect(response.body.data.departure.id).toBe(departure.id)
      expect(response.body.data.dataStage).toBe('not_started')
    })

    it('allows org admin to read operations sheet', async () => {
      const adminToken = await loginAs(app, 'admin')
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-admin` })

      const response = await authRequest(app, adminToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      expect(response.body.data.departure.id).toBe(departure.id)
    })

    it('returns 404 for cross-organization departure', async () => {
      const otherOrg = await prisma.organization.create({
        data: {
          name: `${testPrefix}-ops-other-org`,
          businessPrefix: uniqueBusinessPrefix(`${testPrefix}-ops-other`),
        },
      })
      const otherUser = await prisma.user.create({
        data: {
          organizationId: otherOrg.id,
          username: `${testPrefix}-ops-other-user`,
          passwordHash: 'unused',
          name: '跨企业用户',
        },
      })
      const foreign = await prisma.departure.create({
        data: {
          organizationId: otherOrg.id,
          departureNo: `${testPrefix}-ops-foreign`,
          name: `${testPrefix}-ops-foreign-name`,
          routeName: '外部路线',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-05T00:00:00.000Z'),
          dayCount: 5,
          ownerUserId: otherUser.id,
        },
      })

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${foreign.id}/operations-sheet`)
        .expect(404)

      expect(response.body.message).toBe('发团不存在')

      await prisma.departure.delete({ where: { id: foreign.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
      await prisma.organization.delete({ where: { id: otherOrg.id } })
    })

    it('rejects users without /departure menu permission', async () => {
      const { hash } = await import('bcryptjs')
      const password = 'admin123'
      const username = `${testPrefix}-ops-noperm`
      const user = await prisma.user.create({
        data: {
          organizationId,
          username,
          passwordHash: await hash(password, 10),
          name: '无发团权限用户',
        },
      })

      const token = await loginAs(app, username, password)
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-noperm-dep` })

      const response = await authRequest(app, token)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(403)

      expect(response.body.message).toBe('无权访问')

      await prisma.user.delete({ where: { id: user.id } })
    })

    it('downloads xlsx workbook matching preview semantics (#99)', async () => {
      const ExcelJS = await import('exceljs')
      const departure = await createOpsDeparture({
        name: `${testPrefix}-ops-xlsx/导出*测试`,
      })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 2,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          notes: 'xlsx客源备注',
        })
        .expect(201)

      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: 'xlsx行程段',
          startDate: '2026-09-01',
          endDate: '2026-09-03',
          destination: '喀纳斯',
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: 'xlsx酒店',
          amountCents: 90000,
        })
        .expect(201)

      const preview = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet`)
        .expect(200)

      const previewSheet = preview.body.data
      expect(previewSheet.dataStage).toBe('not_started')
      expect(previewSheet.sourceOrders[0].receivablePaths[0].receivedCents).toBeNull()
      expect(previewSheet.segments[0].resources[0].paidCents).toBeNull()

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet.xlsx`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => callback(null, Buffer.concat(chunks)))
        })
        .expect(200)

      expect(response.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      const disposition = String(response.headers['content-disposition'] ?? '')
      expect(disposition).toMatch(/attachment/)
      expect(disposition).toContain(encodeURIComponent('发团运营表'))
      expect(disposition).toContain(departure.departureNo)
      const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? ''
      const decodedFilename = decodeURIComponent(filenameStar)
      expect(decodedFilename).toContain('发团运营表')
      expect(decodedFilename).toContain(departure.departureNo)
      expect(decodedFilename).toMatch(/\.xlsx$/)
      const snapshotDate = (() => {
        const date = new Date(previewSheet.exportedAt)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      })()
      expect(decodedFilename).toContain(snapshotDate)
      expect(decodedFilename).not.toMatch(/[\\/:*?"<>|]/)
      expect(Buffer.isBuffer(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(1000)
      // Must not be the global JSON envelope.
      expect(response.body.subarray(0, 1).toString('utf8')).not.toBe('{')

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(response.body as any)
      expect(workbook.worksheets).toHaveLength(1)

      const worksheet = workbook.worksheets[0]
      expect(worksheet.name).toBe('发团运营表')

      const cellTexts: string[] = []
      const moneyCells: Array<{ value: unknown; numFmt?: string; formula?: unknown }> = []
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            cellTexts.push(text)
          }
          if (typeof cell.value === 'number') {
            moneyCells.push({ value: cell.value, numFmt: cell.numFmt })
          }
          if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
            moneyCells.push({ value: cell.value, formula: (cell.value as { formula: string }).formula })
          }
        })
      })

      expect(moneyCells.every((cell) => !cell.formula)).toBe(true)

      for (const section of [
        '发团与数据阶段',
        '客源及应收',
        '行程段资源及应付',
        '发团级备注',
      ]) {
        expect(cellTexts).toContain(section)
      }

      expect(cellTexts).toContain(previewSheet.organizationName)
      expect(cellTexts).toContain(previewSheet.exportedByName)
      expect(cellTexts).toContain('快照时间')
      expect(cellTexts).toContain('企业')
      expect(cellTexts).toContain('导出人')
      expect(cellTexts.some((text) => text.includes(departure.departureNo))).toBe(true)
      expect(cellTexts).toContain('客源：xlsx客源备注')
      expect(cellTexts).toContain('xlsx酒店')
      expect(cellTexts).toContain('发团级备注应单独归属')
      expect(cellTexts.filter((text) => text === '—').length).toBeGreaterThanOrEqual(4)

      const agreedReceivableYuan =
        previewSheet.sourceOrders[0].agreedReceivableCents / 100
      const agreedPayableYuan = previewSheet.segments[0].resources[0].agreedPayableCents / 100
      expect(moneyCells.some((cell) => cell.value === agreedReceivableYuan)).toBe(true)
      expect(moneyCells.some((cell) => cell.value === agreedPayableYuan)).toBe(true)
      expect(
        moneyCells.some(
          (cell) =>
            typeof cell.numFmt === 'string' &&
            (cell.numFmt.includes('¥') || cell.numFmt.includes('￥')),
        ),
      ).toBe(true)

      // Finance-not-started: no pending / summary sections that would imply progress.
      expect(cellTexts).not.toContain('待确认款项')
    })

    it('denies xlsx download without /departure permission and cross-org (#99)', async () => {
      const { hash } = await import('bcryptjs')
      const password = 'admin123'
      const username = `${testPrefix}-ops-xlsx-noperm`
      const user = await prisma.user.create({
        data: {
          organizationId,
          username,
          passwordHash: await hash(password, 10),
          name: '无发团权限xlsx',
        },
      })
      const token = await loginAs(app, username, password)
      const departure = await createOpsDeparture({ name: `${testPrefix}-ops-xlsx-noperm-dep` })

      await authRequest(app, token)
        .get(`/api/departures/${departure.id}/operations-sheet.xlsx`)
        .expect(403)

      const otherOrg = await prisma.organization.create({
        data: {
          name: `${testPrefix}-ops-xlsx-other-org`,
          businessPrefix: uniqueBusinessPrefix(`${testPrefix}-ops-xlsx-other`),
        },
      })
      const otherUser = await prisma.user.create({
        data: {
          organizationId: otherOrg.id,
          username: `${testPrefix}-ops-xlsx-other-user`,
          passwordHash: 'unused',
          name: '跨企业xlsx',
        },
      })
      const foreign = await prisma.departure.create({
        data: {
          organizationId: otherOrg.id,
          departureNo: `${testPrefix}-ops-xlsx-foreign`,
          name: `${testPrefix}-ops-xlsx-foreign-name`,
          routeName: '外部路线',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-05T00:00:00.000Z'),
          dayCount: 5,
          ownerUserId: otherUser.id,
        },
      })

      await authRequest(app, coordinatorToken)
        .get(`/api/departures/${foreign.id}/operations-sheet.xlsx`)
        .expect(404)

      await prisma.departure.delete({ where: { id: foreign.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
      await prisma.organization.delete({ where: { id: otherOrg.id } })
      await prisma.user.delete({ where: { id: user.id } })
    })

    it('configures printable A4 landscape layout with repeated identity, wrap, and anomaly text (#100)', async () => {
      const ExcelJS = await import('exceljs')
      const longNotes =
        '这是一段用于验收自动换行的超长备注，包含常用中文说明：司机、导游、车牌、酒店入住安排以及客户临时交代事项。'.repeat(
          3,
        )
      const departureName = `${testPrefix}-ops-print-layout`
      const departure = await createOpsDeparture({
        name: departureName,
        notes: longNotes,
      })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId: opsPartnerId,
          adultGuestCount: 3,
          childGuestCount: 1,
          adultUnitPriceCents: 150000,
          childUnitPriceCents: 90000,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.partner_settled,
          notes: longNotes,
        })
        .expect(201)

      const segment = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '打印验收行程段',
          startDate: '2026-09-01',
          endDate: '2026-09-04',
          destination: '喀纳斯',
          notes: longNotes,
        })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/segments/${segment.body.data.id}/resources`)
        .send({
          resourceKind: ResourceKind.hotel,
          supplierId: opsSupplierId,
          title: '打印验收酒店',
          amountCents: 188800,
          notes: longNotes,
        })
        .expect(201)

      const response = await authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.id}/operations-sheet.xlsx`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => callback(null, Buffer.concat(chunks)))
        })
        .expect(200)

      const workbook = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(response.body as any)
      const worksheet = workbook.worksheets[0]
      expect(worksheet).toBeDefined()

      const pageSetup = worksheet.pageSetup
      expect(pageSetup.paperSize).toBe(9) // A4
      expect(pageSetup.orientation).toBe('landscape')
      expect(pageSetup.fitToPage).toBe(true)
      expect(pageSetup.fitToWidth).toBe(1)
      expect(pageSetup.fitToHeight).toBe(0)

      const printTitlesRow = pageSetup.printTitlesRow
      expect(typeof printTitlesRow).toBe('string')
      expect(printTitlesRow).toMatch(/^\d+:\d+$/)
      const [titleStart, titleEnd] = printTitlesRow!.split(':').map(Number)
      const identityTexts: string[] = []
      for (let rowNumber = titleStart; rowNumber <= titleEnd; rowNumber += 1) {
        worksheet.getRow(rowNumber).eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            identityTexts.push(text)
          }
        })
      }
      expect(identityTexts.some((text) => text.includes('发团运营表'))).toBe(true)
      expect(identityTexts.some((text) => text.includes(departure.departureNo))).toBe(true)
      expect(identityTexts.some((text) => text.includes(departureName))).toBe(true)
      expect(identityTexts.some((text) => text.includes('客源及应收'))).toBe(true)
      expect(identityTexts.some((text) => text.includes('行程段资源及应付'))).toBe(true)

      const wrappedNotes = worksheet
        .getSheetValues()
        .flatMap((row) => (Array.isArray(row) ? row : []))
        .filter((value) => typeof value === 'string' && value.includes('超长备注'))
      expect(wrappedNotes.length).toBeGreaterThan(0)

      let foundWrappedNote = false
      let foundRightAlignedMoney = false
      const moneyColumnWidths = new Set<number>()
      worksheet.eachRow((row) => {
        row.eachCell((cell, colNumber) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text.includes('超长备注') && cell.alignment?.wrapText === true) {
            foundWrappedNote = true
          }
          if (typeof cell.value === 'number') {
            expect(cell.alignment?.horizontal).toBe('right')
            expect(typeof cell.numFmt).toBe('string')
            foundRightAlignedMoney = true
            const width = worksheet.getColumn(colNumber).width
            expect(typeof width).toBe('number')
            expect(width!).toBeGreaterThanOrEqual(12)
            expect(width!).toBeLessThanOrEqual(16)
            moneyColumnWidths.add(colNumber)
          }
        })
      })
      expect(foundWrappedNote).toBe(true)
      expect(foundRightAlignedMoney).toBe(true)
      expect(moneyColumnWidths.size).toBeGreaterThan(0)

      // Table chrome: column headers must carry borders + fill (not bold-only data dump).
      const headerStyles: Array<{ text: string; hasBorder: boolean; hasFill: boolean }> = []
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (['合作方', '收款路径', '资源种类'].includes(text)) {
            const border = cell.border ?? {}
            const hasBorder = ['top', 'left', 'bottom', 'right'].some(
              (side) => Boolean((border as Record<string, { style?: string }>)[side]?.style),
            )
            const fill = cell.fill as { fgColor?: unknown } | undefined
            headerStyles.push({
              text,
              hasBorder,
              hasFill: Boolean(fill?.fgColor),
            })
          }
        })
      })
      expect(headerStyles.length).toBeGreaterThan(0)
      expect(headerStyles.every((item) => item.hasBorder && item.hasFill)).toBe(true)

      const cellTexts: string[] = []
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const text = cell.text?.trim() || String(cell.value ?? '').trim()
          if (text) {
            cellTexts.push(text)
          }
        })
      })
      expect(cellTexts).toContain('打印验收行程段')
      expect(cellTexts).toContain('客源及应收')
      expect(cellTexts).toContain('行程段资源及应付')
      expect(cellTexts.filter((text) => text === '—').length).toBeGreaterThanOrEqual(2)
    })
  })
})
