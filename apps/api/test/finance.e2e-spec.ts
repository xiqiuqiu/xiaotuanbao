import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  UserStatus,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { PaymentScheduleStatus, PaymentChannel, PRESET_ROLE_NAMES } from '@xiaotuanbao/shared'
import { MISSING_BUSINESS_PREFIX_MESSAGE } from '../src/modules/number-allocation/number-allocation.service'
import { authRequest, AR_AP_SCHEDULE_NO_REGEX, CL_NO_REGEX, createTestApp, loginAs, TX_NO_REGEX, uniqueBusinessPrefix } from './helpers'

describe('Finance API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  let ownerUserId: string
  let financeUserId: string
  let departureId: string
  let otherDepartureId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-finance-${Date.now()}`

  function schedulePayload(overrides: Record<string, unknown> = {}) {
    return {
      departureId,
      title: `${testPrefix}-节点`,
      amountCents: 50000,
      dueDate: '2026-12-31',
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      counterpartyName: `${testPrefix}-partner`,
      ...overrides,
    }
  }

  function confirmPayload(overrides: Record<string, unknown> = {}) {
    return {
      amountCents: 50000,
      transactionDate: '2026-07-07',
      paymentChannel: PaymentChannel.BANK_TRANSFER,
      ...overrides,
    }
  }
  function transactionPayload(overrides: Record<string, unknown> = {}) {
    return {
      direction: 'inflow',
      paymentChannel: PaymentChannel.BANK_TRANSFER,
      amountCents: 50000,
      transactionDate: '2026-07-07',
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      counterpartyName: `${testPrefix}-partner`,
      departureId,
      ...overrides,
    }
  }

  function verificationPayload(overrides: Record<string, unknown> = {}) {
    return {
      amountCents: 50000,
      verificationDate: '2026-07-07',
      ...overrides,
    }
  }

  function payablePayload(overrides: Record<string, unknown> = {}) {
    return {
      departureId,
      title: `${testPrefix}-应付节点`,
      amountCents: 50000,
      dueDate: '2026-12-31',
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: supplierId,
      counterpartyName: `${testPrefix}-supplier`,
      ...overrides,
    }
  }

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
    adminToken = await loginAs(app, 'admin')

    const user = await prisma.user.findFirst({
      where: { username: 'wangjie', deletedAt: null },
    })
    if (!user) {
      throw new Error('Seed user wangjie not found')
    }
    organizationId = user.organizationId
    ownerUserId = user.id

    const financeUser = await prisma.user.findFirst({
      where: { username: 'acai', deletedAt: null },
    })
    if (!financeUser) {
      throw new Error('Seed user acai not found')
    }
    financeUserId = financeUser.id

    const departure = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `${testPrefix}-dep`,
        name: `${testPrefix}-发团`,
        routeName: '测试路线',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-10T00:00:00.000Z'),
        dayCount: 10,
        ownerUserId,
      },
    })
    departureId = departure.id

    const otherDeparture = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `${testPrefix}-dep-other`,
        name: `${testPrefix}-其他发团`,
        routeName: '其他路线',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-05T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId,
      },
    })
    otherDepartureId = otherDeparture.id

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

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-supplier`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    const sentinelDeparture = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `sentinel-${Date.now()}`,
        name: 'finance-e2e-cleanup-sentinel',
        routeName: 'cleanup sentinel',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-01T00:00:00.000Z'),
        dayCount: 1,
        ownerUserId,
      },
    })
    const sentinelSchedule = await prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId: sentinelDeparture.id,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: `sentinel-ar-${Date.now()}`,
        title: 'cleanup sentinel',
        amountCents: 1,
        dueDate: new Date('2026-01-01T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: 'cleanup sentinel',
      },
    })
    const sentinelTransaction = await prisma.financeTransaction.create({
      data: {
        organizationId,
        transactionNo: `sentinel-tx-${Date.now()}`,
        direction: 'inflow',
        paymentChannel: 'other',
        amountCents: 1,
        transactionDate: new Date('2026-01-01T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: 'cleanup sentinel',
      },
    })
    const sentinelVerification = await prisma.financeVerification.create({
      data: {
        organizationId,
        verificationNo: `sentinel-cl-${Date.now()}`,
        paymentScheduleId: sentinelSchedule.id,
        transactionId: sentinelTransaction.id,
        amountCents: 1,
        verificationDate: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: ownerUserId,
        billUnsettledAfterCents: 0,
      },
    })

    const fixtureDepartures = await prisma.departure.findMany({
      where: {
        organizationId,
        OR: [
          { id: { in: [departureId, otherDepartureId] } },
          { name: { startsWith: testPrefix } },
        ],
      },
      select: { id: true },
    })
    const fixtureDepartureIds = fixtureDepartures.map((item) => item.id)
    const fixtureTransactions = await prisma.financeTransaction.findMany({
      where: {
        organizationId,
        OR: [
          { departureId: { in: fixtureDepartureIds } },
          { counterpartyId: { in: [partnerId, supplierId] } },
          { counterpartyName: { startsWith: testPrefix } },
          {
            verifications: {
              some: { paymentSchedule: { departureId: { in: fixtureDepartureIds } } },
            },
          },
        ],
      },
      select: { id: true },
    })
    const fixtureTransactionIds = fixtureTransactions.map((item) => item.id)

    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        OR: [
          { transactionId: { in: fixtureTransactionIds } },
          { paymentSchedule: { departureId: { in: fixtureDepartureIds } } },
        ],
      },
    })
    await prisma.financeTransaction.deleteMany({
      where: { organizationId, id: { in: fixtureTransactionIds } },
    })
    await prisma.departureSettlementHistory.deleteMany({
      where: { organizationId, departureId: { in: fixtureDepartureIds } },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departureId: { in: fixtureDepartureIds },
      },
    })
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        id: { in: fixtureDepartureIds },
      },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.financeIdempotencyRecord.deleteMany({
      where: { organizationId, idempotencyKey: { startsWith: testPrefix } },
    })

    const [sentinelTransactionAfter, sentinelVerificationAfter] = await Promise.all([
      prisma.financeTransaction.findUnique({ where: { id: sentinelTransaction.id } }),
      prisma.financeVerification.findUnique({ where: { id: sentinelVerification.id } }),
    ])
    await prisma.financeVerification.delete({ where: { id: sentinelVerification.id } })
    await prisma.financeTransaction.delete({ where: { id: sentinelTransaction.id } })
    await prisma.paymentSchedule.delete({ where: { id: sentinelSchedule.id } })
    await prisma.departure.delete({ where: { id: sentinelDeparture.id } })

    expect(sentinelTransactionAfter).not.toBeNull()
    expect(sentinelVerificationAfter).not.toBeNull()
    await expect(
      prisma.departure.count({
        where: { organizationId, name: { startsWith: testPrefix } },
      }),
    ).resolves.toBe(0)
    await expect(
      prisma.financeTransaction.count({
        where: { organizationId, counterpartyName: { startsWith: testPrefix } },
      }),
    ).resolves.toBe(0)
    await expect(
      prisma.financeIdempotencyRecord.count({
        where: { organizationId, idempotencyKey: { startsWith: testPrefix } },
      }),
    ).resolves.toBe(0)
    await prisma.$disconnect()
    await app.close()
  })

  it('allows coordinator to POST /finance/receivables (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-计调应收` }))
      .expect(201)

    expect(response.body.data.direction).toBe(PaymentScheduleDirection.receivable)
  })

  it('allows coordinator to POST /finance/payables (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/finance/payables')
      .send(schedulePayload({ title: `${testPrefix}-计调应付` }))
      .expect(201)

    expect(response.body.data.direction).toBe(PaymentScheduleDirection.payable)
  })

  it('lists organization-scoped finance reference options for finance and coordinator', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/finance/departure-options')
      .expect(200)

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: departureId,
          departureNo: `${testPrefix}-dep`,
          name: `${testPrefix}-发团`,
        }),
      ]),
    )
    expect(response.body.data[0]).toEqual({
      id: expect.any(String),
      departureNo: expect.any(String),
      name: expect.any(String),
      status: expect.any(String),
    })

    const partnerOptions = await authRequest(app, financeToken)
      .get('/api/finance/partner-options')
      .expect(200)
    expect(partnerOptions.body.data).toEqual(
      expect.arrayContaining([{ id: partnerId, name: `${testPrefix}-partner` }]),
    )

    const supplierOptions = await authRequest(app, financeToken)
      .get('/api/finance/supplier-options')
      .expect(200)
    expect(supplierOptions.body.data).toEqual(
      expect.arrayContaining([{ id: supplierId, name: `${testPrefix}-supplier` }]),
    )

    await authRequest(app, coordinatorToken)
      .get('/api/finance/departure-options')
      .expect(200)
  })

  it('lists only source orders with guest-collection path in source-order-options', async () => {
    const guestOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 10000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const partnerOnlyOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 10000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)

    expect(guestOrder.body.data.guestCollectCents).toBeGreaterThan(0)
    expect(partnerOnlyOrder.body.data.guestCollectCents).toBe(0)

    const options = await authRequest(app, financeToken)
      .get('/api/finance/source-order-options')
      .query({ departureId })
      .expect(200)

    const ids = (options.body.data as Array<{ id: string }>).map((item) => item.id)
    expect(ids).toContain(guestOrder.body.data.id)
    expect(ids).not.toContain(partnerOnlyOrder.body.data.id)
  })

  it('creates receivable with AR schedule number for finance role', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-应收` }))
      .expect(201)

    expect(response.body.data.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    expect(response.body.data.direction).toBe(PaymentScheduleDirection.receivable)
    expect(response.body.data.amountCents).toBe(50000)
    expect(response.body.data.status).toBeTruthy()
    expect(response.body.data.financeTouched).toBe(false)
  })

  it('replays manual receivable creation with the same idempotency key', async () => {
    const idempotencyKey = `${testPrefix}-create-receivable-retry`
    const payload = schedulePayload({ title: `${testPrefix}-幂等手工应收` })

    const first = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(
      await prisma.paymentSchedule.count({
        where: { organizationId, title: `${testPrefix}-幂等手工应收` },
      }),
    ).toBe(1)
  })

  it('creates receivable for org admin role', async () => {
    const response = await authRequest(app, adminToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-admin-应收` }))
      .expect(201)

    expect(response.body.data.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
  })

  it('creates payable with AP schedule number for finance role', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send(
        schedulePayload({
          title: `${testPrefix}-应付`,
          counterpartyType: CounterpartyType.supplier,
        }),
      )
      .expect(201)

    expect(response.body.data.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    expect(response.body.data.direction).toBe(PaymentScheduleDirection.payable)
  })

  it('rejects amountCents of 0', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ amountCents: 0 }))
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('金额必须大于 0')
  })

  it('rejects negative amountCents', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ amountCents: -100 }))
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('金额必须大于 0')
  })

  it('filters receivables by departureId', async () => {
    await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          departureId: otherDepartureId,
          title: `${testPrefix}-其他团应收`,
        }),
      )
      .expect(201)

    const response = await authRequest(app, financeToken)
      .get('/api/finance/receivables')
      .query({ departureId: otherDepartureId, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items.length).toBeGreaterThanOrEqual(1)
    expect(
      response.body.data.items.every(
        (item: { departureId: string }) => item.departureId === otherDepartureId,
      ),
    ).toBe(true)
  })

  it('updates title and amount when not finance-touched', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-待更新` }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${created.body.data.id}`)
      .send({
        title: `${testPrefix}-已更新`,
        amountCents: 60000,
      })
      .expect(200)

    expect(response.body.data.title).toBe(`${testPrefix}-已更新`)
    expect(response.body.data.amountCents).toBe(60000)
    // Ordinary edit must not set amountAdjustedAt / financeTouched (ADR-0010).
    expect(response.body.data.financeTouched).toBe(false)
    expect(response.body.data.amountAdjustedAt).toBeNull()
  })

  it('replays payment schedule update with the same idempotency key', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等编辑节点前` }))
      .expect(201)
    const idempotencyKey = `${testPrefix}-update-schedule-retry`
    const payload = { title: `${testPrefix}-幂等编辑节点后`, amountCents: 45000 }

    const first = await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${created.body.data.id}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(200)
    const replay = await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${created.body.data.id}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(200)

    expect(replay.body.data).toEqual(first.body.data)
    expect(replay.body.data.amountCents).toBe(45000)
  })

  it('cancels schedule and returns cancelled status', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-待关闭` }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '测试关闭' })
      .expect(201)

    expect(response.body.data.cancelledAt).toBeTruthy()
    expect(response.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)
    expect(response.body.data.financeTouched).toBe(true)
  })

  it('closes one schedule only once under concurrent retry requests', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-并发关闭` }))
      .expect(201)

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, financeToken)
          .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
          .send({ closeDisposition: 'other', cancelReason: '并发重试关闭' }),
      ),
    )
    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)
    const closeActivities = detail.body.data.activities.filter(
      (activity: { activityType: string }) => activity.activityType === 'close',
    )

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      rejectedCount: responses.filter((response) => response.status === 400).length,
      closeActivityCount: closeActivities.length,
      isClosed: detail.body.data.cancelledAt != null,
    }).toEqual({
      successCount: 1,
      rejectedCount: 7,
      closeActivityCount: 1,
      isClosed: true,
    })
  })

  it('replays schedule close with the same idempotency key', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等关闭节点` }))
      .expect(201)
    const idempotencyKey = `${testPrefix}-close-schedule-retry`
    const payload = { closeDisposition: 'other', cancelReason: '幂等关闭测试' }

    const first = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(
      await prisma.paymentScheduleActivity.count({
        where: {
          organizationId,
          paymentScheduleId: created.body.data.id,
          activityType: 'close',
        },
      }),
    ).toBe(1)
  })

  it('reopens one schedule only once under concurrent retry requests', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-并发重开` }))
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '准备并发重开' })
      .expect(201)

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, financeToken)
          .post(`/api/finance/payment-schedules/${created.body.data.id}/reopen`)
          .send({ reopenReason: '并发重试重开' }),
      ),
    )
    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)
    const reopenActivities = detail.body.data.activities.filter(
      (activity: { activityType: string }) => activity.activityType === 'reopen',
    )

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      rejectedCount: responses.filter((response) => response.status === 400).length,
      reopenActivityCount: reopenActivities.length,
      isOpen: detail.body.data.cancelledAt == null,
    }).toEqual({
      successCount: 1,
      rejectedCount: 7,
      reopenActivityCount: 1,
      isOpen: true,
    })
  })

  it('replays schedule reopen with the same idempotency key', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等重开节点` }))
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '重开前关闭' })
      .expect(201)
    const idempotencyKey = `${testPrefix}-reopen-schedule-retry`
    const payload = { reopenReason: '幂等重开测试' }

    const first = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/reopen`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/reopen`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(
      await prisma.paymentScheduleActivity.count({
        where: {
          organizationId,
          paymentScheduleId: created.body.data.id,
          activityType: 'reopen',
        },
      }),
    ).toBe(1)
  })

  describe('payment schedule edit guards', () => {
    async function createSettledReceivable(titleSuffix: string) {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-${titleSuffix}`, amountCents: 50000 }))
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
        .send(confirmPayload({ amountCents: 50000 }))
        .expect(201)

      return created.body.data as { id: string }
    }

    async function createSettledPayable(titleSuffix: string) {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/payables')
        .send(payablePayload({ title: `${testPrefix}-${titleSuffix}`, amountCents: 40000 }))
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payables/${created.body.data.id}/confirm-payment`)
        .send(confirmPayload({ amountCents: 40000 }))
        .expect(201)

      return created.body.data as { id: string }
    }

    it('rejects amount update when finance-touched from settlement', async () => {
      const schedule = await createSettledReceivable('已介入金额')

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${schedule.id}`)
        .send({ amountCents: 60000 })
        .expect(400)

      expect(response.body.message).toBe('财务已介入的节点不可修改金额')
    })

    it('rejects dueDate update when finance-touched from settlement', async () => {
      const schedule = await createSettledReceivable('已介入到期日')

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${schedule.id}`)
        .send({ dueDate: '2027-01-01' })
        .expect(400)

      expect(response.body.message).toBe('财务已介入的节点不可修改到期日')
    })

    it('rejects counterparty update when finance-touched from settlement', async () => {
      const schedule = await createSettledReceivable('已介入往来')

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${schedule.id}`)
        .send({
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
          counterpartyName: `${testPrefix}-supplier`,
        })
        .expect(400)

      expect(response.body.message).toBe('财务已介入的节点不可修改往来类型')
    })

    it('still allows title update when finance-touched from settlement', async () => {
      const schedule = await createSettledReceivable('标题可改')

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${schedule.id}`)
        .send({ title: `${testPrefix}-标题已更新` })
        .expect(200)

      expect(response.body.data.title).toBe(`${testPrefix}-标题已更新`)
      expect(response.body.data.financeTouched).toBe(true)
    })

    it('rejects amount update on finance-touched payable', async () => {
      const schedule = await createSettledPayable('应付已介入')

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/payables/${schedule.id}`)
        .send({ amountCents: 50000 })
        .expect(400)

      expect(response.body.message).toBe('财务已介入的节点不可修改金额')
    })

    it('rejects patch on cancelled receivable schedule', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-关闭后编辑` }))
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
        .send({ closeDisposition: 'other', cancelReason: '测试关闭' })
        .expect(201)

      const response = await authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${created.body.data.id}`)
        .send({ title: `${testPrefix}-不应成功` })
        .expect(400)

      expect(response.body.message).toBe('已关闭节点不可编辑')
    })

    it('never commits both ordinary amount edit and verification under concurrency', async () => {
      const schedule = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-普通编辑核销竞争`, amountCents: 50000 }))
        .expect(201)
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const requests = Array.from({ length: 8 }, () => [
        authRequest(app, financeToken)
          .post('/api/finance/verifications')
          .send(
            verificationPayload({
              paymentScheduleId: schedule.body.data.id,
              transactionId: transaction.body.data.id,
              amountCents: 50000,
            }),
          ),
        authRequest(app, financeToken)
          .patch(`/api/finance/receivables/${schedule.body.data.id}`)
          .send({ amountCents: 10000 }),
      ]).flat()
      const responses = await Promise.all(requests)

      const verificationSuccessCount = responses.filter(
        (response, index) => index % 2 === 0 && response.status === 201,
      ).length
      const editSuccessCount = responses.filter(
        (response, index) => index % 2 === 1 && response.status === 200,
      ).length
      const detail = await authRequest(app, financeToken)
        .get(`/api/finance/receivables/${schedule.body.data.id}`)
        .expect(200)

      expect({
        conflictingSuccess: verificationSuccessCount > 0 && editSuccessCount > 0,
        amountCents: detail.body.data.amountCents,
        settledAmountCents: detail.body.data.settledAmountCents,
        allocationWithinAmount:
          detail.body.data.settledAmountCents <= detail.body.data.amountCents,
      }).toEqual({
        conflictingSuccess: false,
        amountCents: verificationSuccessCount === 1 ? 50000 : 10000,
        settledAmountCents: verificationSuccessCount === 1 ? 50000 : 0,
        allocationWithinAmount: true,
      })
    })
  })

  describe('organization without business prefix', () => {
    let prefixlessOrgId: string
    let prefixlessFinanceToken: string
    let prefixlessDepartureId: string
    let prefixlessPartnerId: string
    const prefixlessUsername = `${testPrefix}-noprefix-fin`

    beforeAll(async () => {
      const password = 'admin123'
      const passwordHash = await hash(password, 10)

      const org = await prisma.organization.create({
        data: {
          name: `${testPrefix}-noprefix-org`,
          businessPrefix: uniqueBusinessPrefix(`${testPrefix}-tmp`),
        },
      })
      prefixlessOrgId = org.id

      const financeRole = await prisma.role.findUnique({
        where: { name: PRESET_ROLE_NAMES.FINANCE },
      })
      if (!financeRole) {
        throw new Error('Finance role not found')
      }

      const user = await prisma.user.create({
        data: {
          organizationId: prefixlessOrgId,
          username: prefixlessUsername,
          passwordHash,
          name: '无前缀财务',
        },
      })

      await prisma.userRole.create({
        data: { userId: user.id, roleId: financeRole.id },
      })

      await prisma.organization.update({
        where: { id: prefixlessOrgId },
        data: { businessPrefix: '' },
      })

      prefixlessFinanceToken = await loginAs(app, prefixlessUsername, password)

      const partner = await prisma.partner.create({
        data: {
          organizationId: prefixlessOrgId,
          name: `${testPrefix}-noprefix-partner`,
          partnerKind: PartnerKind.group_agent,
          partnerType: PartnerType.group_agency,
          status: DirectoryProfileStatus.active,
        },
      })
      prefixlessPartnerId = partner.id

      const owner = await prisma.user.findFirst({
        where: { id: user.id },
      })
      if (!owner) {
        throw new Error('Prefixless finance user not found')
      }

      const departure = await prisma.departure.create({
        data: {
          organizationId: prefixlessOrgId,
          departureNo: `${testPrefix}-noprefix-dep`,
          name: `${testPrefix}-无前缀发团`,
          routeName: '测试路线',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-10T00:00:00.000Z'),
          dayCount: 10,
          ownerUserId: owner.id,
        },
      })
      prefixlessDepartureId = departure.id
    })

    afterAll(async () => {
      await prisma.departure.deleteMany({
        where: { organizationId: prefixlessOrgId },
      })
      await prisma.partner.deleteMany({
        where: { organizationId: prefixlessOrgId },
      })
      await prisma.userRole.deleteMany({
        where: { user: { organizationId: prefixlessOrgId } },
      })
      await prisma.user.deleteMany({
        where: { organizationId: prefixlessOrgId },
      })
      await prisma.organization.delete({ where: { id: prefixlessOrgId } })
    })

    it('rejects receivable creation without business prefix', async () => {
      const response = await authRequest(app, prefixlessFinanceToken)
        .post('/api/finance/receivables')
        .send({
          departureId: prefixlessDepartureId,
          title: `${testPrefix}-无前缀应收`,
          amountCents: 50000,
          dueDate: '2026-12-31',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: prefixlessPartnerId,
          counterpartyName: `${testPrefix}-noprefix-partner`,
        })
        .expect(400)

      expect(response.body.message).toBe(MISSING_BUSINESS_PREFIX_MESSAGE)
    })

    it('rejects payable creation without business prefix', async () => {
      const supplier = await prisma.supplier.create({
        data: {
          organizationId: prefixlessOrgId,
          name: `${testPrefix}-noprefix-supplier`,
          categories: [ResourceKind.hotel],
          status: DirectoryProfileStatus.active,
        },
      })

      const response = await authRequest(app, prefixlessFinanceToken)
        .post('/api/finance/payables')
        .send({
          departureId: prefixlessDepartureId,
          title: `${testPrefix}-无前缀应付`,
          amountCents: 50000,
          dueDate: '2026-12-31',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplier.id,
          counterpartyName: supplier.name,
        })
        .expect(400)

      expect(response.body.message).toBe(MISSING_BUSINESS_PREFIX_MESSAGE)

      await prisma.supplier.delete({ where: { id: supplier.id } })
    })

    it('rejects transaction creation without business prefix', async () => {
      const response = await authRequest(app, prefixlessFinanceToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          amountCents: 50000,
          transactionDate: '2026-07-07',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: prefixlessPartnerId,
          counterpartyName: `${testPrefix}-noprefix-partner`,
          departureId: prefixlessDepartureId,
        })
        .expect(400)

      expect(response.body.message).toBe(MISSING_BUSINESS_PREFIX_MESSAGE)
    })
  })

  it('does not expose schedules to another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-foreign-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-foreign`),
      },
    })

    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-foreign-user`,
        passwordHash: 'unused',
        name: '外部财务',
      },
    })

    const foreignDeparture = await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        departureNo: `${testPrefix}-foreign-dep`,
        name: `${testPrefix}-foreign`,
        routeName: '外部路线',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-05T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId: otherUser.id,
      },
    })

    const foreignSchedule = await prisma.paymentSchedule.create({
      data: {
        organizationId: otherOrg.id,
        departureId: foreignDeparture.id,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: `AR${otherOrg.businessPrefix}202608000999`,
        title: `${testPrefix}-foreign-schedule`,
        amountCents: 10000,
        dueDate: new Date('2026-12-31T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
      },
    })

    const response = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${foreignSchedule.id}`)
      .expect(404)

    expect(response.body.code).toBe(404)
    const localList = await authRequest(app, financeToken)
      .get('/api/finance/receivables')
      .query({ pageSize: 100 })
      .expect(200)
    expect(
      localList.body.data.items.some((item: { id: string }) => item.id === foreignSchedule.id),
    ).toBe(false)

    const localSchedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-local-cross-org` }))
      .expect(201)
    const localTransaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload())
      .expect(201)
    const foreignTransaction = await prisma.financeTransaction.create({
      data: {
        organizationId: otherOrg.id,
        transactionNo: `TX${otherOrg.businessPrefix}20260707000999`,
        direction: 'inflow',
        paymentChannel: 'other',
        amountCents: 10000,
        transactionDate: new Date('2026-07-07T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: '外部流水',
      },
    })

    await authRequest(app, financeToken)
      .post('/api/finance/verifications')
      .send(
        verificationPayload({
          paymentScheduleId: foreignSchedule.id,
          transactionId: localTransaction.body.data.id,
          amountCents: 10000,
        }),
      )
      .expect(404)
    await authRequest(app, financeToken)
      .post('/api/finance/verifications')
      .send(
        verificationPayload({
          paymentScheduleId: localSchedule.body.data.id,
          transactionId: foreignTransaction.id,
          amountCents: 10000,
        }),
      )
      .expect(404)
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${foreignSchedule.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '跨组织伪造 ID' })
      .expect(404)
    await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${foreignTransaction.id}/void`)
      .send({ voidReason: '跨组织伪造 ID' })
      .expect(404)

    await prisma.financeTransaction.delete({ where: { id: foreignTransaction.id } })
    await prisma.paymentSchedule.delete({ where: { id: foreignSchedule.id } })
    await prisma.departure.delete({ where: { id: foreignDeparture.id } })
    await prisma.user.delete({ where: { id: otherUser.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('confirms collection and settles receivable', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-登记收款`, amountCents: 50000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload())
      .expect(201)

    const response = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(response.body.data.settledAmountCents).toBe(50000)
    expect(response.body.data.unsettledAmountCents).toBe(0)
    expect(response.body.data.status).toBe(PaymentScheduleStatus.SETTLED)
    expect(response.body.data.financeTouched).toBe(true)
  })

  it('rolls back the transaction when verification insertion fails', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-核销写入故障回滚` }))
      .expect(201)
    const failureMarker = 'e2e-force-verification-failure'

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION e2e_fail_finance_verification_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.remark = '${failureMarker}' THEN
          RAISE EXCEPTION 'forced verification insert failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS e2e_fail_finance_verification_insert ON finance_verifications',
    )
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER e2e_fail_finance_verification_insert
      BEFORE INSERT ON finance_verifications
      FOR EACH ROW EXECUTE FUNCTION e2e_fail_finance_verification_insert()
    `)

    try {
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
        .send(confirmPayload({ amountCents: 20000, notes: failureMarker }))
        .expect(500)
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS e2e_fail_finance_verification_insert ON finance_verifications',
      )
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS e2e_fail_finance_verification_insert()',
      )
    }

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)
    expect(schedule.body.data.settledAmountCents).toBe(0)
    expect(schedule.body.data.unsettledAmountCents).toBe(50000)
    expect(
      await prisma.financeTransaction.count({
        where: { organizationId, notes: failureMarker },
      }),
    ).toBe(0)
  })

  it('supports partial collection until settled', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-部分核销`, amountCents: 50000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 30000 }))
      .expect(201)

    const partial = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(partial.body.data.settledAmountCents).toBe(30000)
    expect(partial.body.data.status).toBe(PaymentScheduleStatus.PENDING)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 20000 }))
      .expect(201)

    const settled = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(settled.body.data.settledAmountCents).toBe(50000)
    expect(settled.body.data.status).toBe(PaymentScheduleStatus.SETTLED)
  })

  it('replays confirm-collection with the same idempotency key without duplicate facts', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等登记收款` }))
      .expect(201)

    const idempotencyKey = `${testPrefix}-confirm-collection-retry`
    const payload = confirmPayload({ amountCents: 20000 })
    const first = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(first.body.data.settledAmountCents).toBe(20000)
    expect(replay.body.data).toEqual(first.body.data)

    const [transactions, verifications] = await Promise.all([
      prisma.financeTransaction.findMany({
        where: {
          organizationId,
          departureId,
          amountCents: 20000,
          notes: null,
          verifications: { some: { paymentScheduleId: created.body.data.id } },
        },
      }),
      prisma.financeVerification.findMany({
        where: { organizationId, paymentScheduleId: created.body.data.id },
      }),
    ])
    expect(transactions).toHaveLength(1)
    expect(verifications).toHaveLength(1)
  })

  it('requires an idempotency key for confirm-collection', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-缺少幂等键` }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .unset('Idempotency-Key')
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(400)

    expect(response.body.message).toContain('幂等键')
  })

  it('rejects confirm-collection when one idempotency key is reused with another payload', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等键载荷冲突` }))
      .expect(201)
    const idempotencyKey = `${testPrefix}-confirm-collection-conflict`

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .set('Idempotency-Key', idempotencyKey)
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(201)
    const conflict = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .set('Idempotency-Key', idempotencyKey)
      .send(confirmPayload({ amountCents: 15000 }))
      .expect(409)

    expect(conflict.body.message).toContain('幂等键')
  })

  it('serializes concurrent confirm-collection retries with one idempotency key', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-并发幂等登记收款` }))
      .expect(201)
    const idempotencyKey = `${testPrefix}-confirm-collection-concurrent`
    const payload = confirmPayload({ amountCents: 20000 })

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, financeToken)
          .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
      ),
    )

    expect(responses.every((response) => response.status === 201)).toBe(true)
    expect(new Set(responses.map((response) => JSON.stringify(response.body.data))).size).toBe(1)
    expect(responses[0].body.data.settledAmountCents).toBe(20000)
    expect(
      await prisma.financeVerification.count({
        where: { organizationId, paymentScheduleId: created.body.data.id },
      }),
    ).toBe(1)
  })

  it('rejects link-transaction on counterparty mismatch', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          title: `${testPrefix}-往来校验`,
          counterpartyType: CounterpartyType.partner,
          counterpartyName: '匹配旅行社',
        }),
      )
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.WECHAT,
        amountCents: 10000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
        departureId,
      })
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 10000 })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('links receivable transaction and creates verification only', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-匹配流水`, amountCents: 50000 }))
      .expect(201)

    const beforeTransactions = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ departureId, pageSize: 100 })
      .expect(200)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 50000 }))
      .expect(201)

    expect(transaction.body.data.transactionNo).toMatch(TX_NO_REGEX)
    expect(transaction.body.data.paymentChannel).toBe(PaymentChannel.BANK_TRANSFER)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 50000 })
      .expect(201)

    const afterTransactions = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ departureId, pageSize: 100 })
      .expect(200)

    expect(afterTransactions.body.data.total).toBe(beforeTransactions.body.data.total + 1)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(50000)
    expect(schedule.body.data.unsettledAmountCents).toBe(0)
    expect(schedule.body.data.status).toBe(PaymentScheduleStatus.SETTLED)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    expect(verifications.body.data.items).toHaveLength(1)
    expect(verifications.body.data.items[0].verificationNo).toMatch(CL_NO_REGEX)
    expect(verifications.body.data.items[0].transactionId).toBe(transaction.body.data.id)
    expect(verifications.body.data.items[0].transactionNo).toMatch(TX_NO_REGEX)
    expect(verifications.body.data.items[0].scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    expect(verifications.body.data.items[0].amountCents).toBe(50000)

    const linkedTransaction = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transaction.body.data.id}`)
      .expect(200)

    expect(linkedTransaction.body.data.allocatedAmountCents).toBe(50000)
    expect(linkedTransaction.body.data.unallocatedAmountCents).toBe(0)
    expect(linkedTransaction.body.data.verificationCount).toBe(1)
    expect(linkedTransaction.body.data.lastVerificationAt).toEqual(expect.any(String))
    expect(linkedTransaction.body.data.verifications).toHaveLength(1)
    expect(linkedTransaction.body.data.verifications[0].verificationNo).toMatch(CL_NO_REGEX)
    expect(linkedTransaction.body.data.verifications[0].scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    expect(linkedTransaction.body.data.verifications[0].amountCents).toBe(50000)
  })

  it('returns empty verification aggregates for unallocated transaction detail', async () => {
    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 30000 }))
      .expect(201)

    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transaction.body.data.id}`)
      .expect(200)

    expect(detail.body.data.allocatedAmountCents).toBe(0)
    expect(detail.body.data.unallocatedAmountCents).toBe(30000)
    expect(detail.body.data.verificationCount).toBe(0)
    expect(detail.body.data.lastVerificationAt).toBeNull()
    expect(detail.body.data.verifications).toEqual([])
  })

  it('supports partial link-transaction with min default amount semantics', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-部分匹配`, amountCents: 80000 }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 50000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 50000 })
      .expect(201)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(50000)
    expect(schedule.body.data.unsettledAmountCents).toBe(30000)
    expect(schedule.body.data.status).toBe(PaymentScheduleStatus.PENDING)
  })

  it('replays link-transaction with the same idempotency key', async () => {
    const receivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-幂等匹配流水` }))
      .expect(201)
    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload())
      .expect(201)
    const payload = { transactionId: transaction.body.data.id, amountCents: 20000 }
    const idempotencyKey = `${testPrefix}-link-transaction-retry`

    const first = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.id}/link-transaction`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.id}/link-transaction`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(replay.body.data.settledAmountCents).toBe(20000)
    expect(
      await prisma.financeVerification.count({
        where: { organizationId, paymentScheduleId: receivable.body.data.id },
      }),
    ).toBe(1)
  })

  it('rejects link-transaction on direction mismatch', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-方向校验` }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          direction: 'outflow',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
        }),
      )
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 10000 })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('rejects link-transaction when amount exceeds unallocated balance', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-流水上限`, amountCents: 50000 }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 30000 }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 40000 })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('rejects link-transaction when amount exceeds unsettled schedule balance', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-节点上限`, amountCents: 30000 }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 50000 }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 40000 })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('never over-allocates a schedule or transaction under concurrent verification requests', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-并发核销`, amountCents: 10000 }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ amountCents: 10000 }))
      .expect(201)

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, financeToken)
          .post('/api/finance/verifications')
          .send(
            verificationPayload({
              paymentScheduleId: created.body.data.id,
              transactionId: transaction.body.data.id,
              amountCents: 10000,
            }),
          ),
      ),
    )

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)
    const transactionDetail = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transaction.body.data.id}`)
      .expect(200)

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      settledAmountCents: schedule.body.data.settledAmountCents,
      unsettledAmountCents: schedule.body.data.unsettledAmountCents,
      allocatedAmountCents: transactionDetail.body.data.allocatedAmountCents,
      unallocatedAmountCents: transactionDetail.body.data.unallocatedAmountCents,
    }).toEqual({
      successCount: 1,
      settledAmountCents: 10000,
      unsettledAmountCents: 0,
      allocatedAmountCents: 10000,
      unallocatedAmountCents: 0,
    })
  })

  it('links payable transaction with outflow direction', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send(payablePayload({ title: `${testPrefix}-应付匹配`, amountCents: 40000 }))
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          direction: 'outflow',
          amountCents: 40000,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${created.body.data.id}/link-transaction`)
      .send({ transactionId: transaction.body.data.id, amountCents: 40000 })
      .expect(201)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(40000)
    expect(schedule.body.data.status).toBe(PaymentScheduleStatus.SETTLED)
  })

  it('cancels verification and restores unsettled schedule state', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-撤销核销`, amountCents: 50000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload())
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    const verificationId = verifications.body.data.items[0].id

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .send({ cancelReason: '测试撤销' })
      .expect(201)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(0)
    expect(schedule.body.data.status).not.toBe(PaymentScheduleStatus.SETTLED)

    const again = await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .send({ cancelReason: '重复撤销' })
      .expect(400)

    expect(again.body.code).toBe(400)
  })

  it('rolls a settled departure back atomically when verification cancellation reopens debt', async () => {
    const departure = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-撤销核销回退`,
        routeName: '撤销核销回退路线',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        ownerUserId,
      })
      .expect(201)
    const schedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          departureId: departure.body.data.id,
          title: `${testPrefix}-撤销核销回退应收`,
        }),
      )
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedule.body.data.id}/confirm-collection`)
      .send(confirmPayload())
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id}/transition`)
      .send({ targetStatus: 'pending_settlement' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id}/transition`)
      .send({ targetStatus: 'settled' })
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: schedule.body.data.scheduleNo,
        scheduleNoMatch: 'exact',
        pageSize: 10,
      })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '结清后发现核销错误' })
      .expect(201)

    const [departureAfter, scheduleAfter] = await Promise.all([
      authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.body.data.id}`)
        .expect(200),
      authRequest(app, financeToken)
        .get(`/api/finance/receivables/${schedule.body.data.id}`)
        .expect(200),
    ])

    expect({
      departureStatus: departureAfter.body.data.status,
      settledAmountCents: scheduleAfter.body.data.settledAmountCents,
      unsettledAmountCents: scheduleAfter.body.data.unsettledAmountCents,
      settlementHistory: departureAfter.body.data.settlementHistory,
    }).toEqual({
      departureStatus: 'pending_settlement',
      settledAmountCents: 0,
      unsettledAmountCents: 50000,
      settlementHistory: [
        expect.objectContaining({
          triggerPaymentScheduleId: schedule.body.data.id,
          reason: '结清后发现核销错误',
          previousStatus: 'settled',
          newStatus: 'pending_settlement',
          operatedBy: financeUserId,
        }),
      ],
    })
  })

  it('keeps a settled departure settled when cancellation leaves the schedule closed', async () => {
    const departure = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-关闭节点撤销核销`,
        routeName: '关闭节点撤销核销路线',
        startDate: '2026-11-11',
        endDate: '2026-11-13',
        ownerUserId,
      })
      .expect(201)
    const schedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          departureId: departure.body.data.id,
          title: `${testPrefix}-关闭节点撤销核销应收`,
        }),
      )
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedule.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 20000 }))
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedule.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '剩余金额停止追收' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id}/transition`)
      .send({ targetStatus: 'pending_settlement' })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id}/transition`)
      .send({ targetStatus: 'settled' })
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: schedule.body.data.scheduleNo,
        scheduleNoMatch: 'exact',
        pageSize: 10,
      })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '关闭节点保留关闭决定' })
      .expect(201)

    const [departureAfter, scheduleAfter] = await Promise.all([
      authRequest(app, coordinatorToken)
        .get(`/api/departures/${departure.body.data.id}`)
        .expect(200),
      authRequest(app, financeToken)
        .get(`/api/finance/receivables/${schedule.body.data.id}`)
        .expect(200),
    ])
    expect({
      departureStatus: departureAfter.body.data.status,
      cancelledAt: scheduleAfter.body.data.cancelledAt,
      settledAmountCents: scheduleAfter.body.data.settledAmountCents,
      unsettledAmountCents: scheduleAfter.body.data.unsettledAmountCents,
    }).toEqual({
      departureStatus: 'settled',
      cancelledAt: expect.any(String),
      settledAmountCents: 0,
      unsettledAmountCents: 50000,
    })
  })

  it('cancels one verification only once under concurrent retry requests', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-并发撤销`, amountCents: 50000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 20000 }))
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    const verificationId = verifications.body.data.items[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '关闭后并发撤销核销' })
      .expect(201)

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, financeToken)
          .post(`/api/finance/verifications/${verificationId}/cancel`)
          .send({ cancelReason: '并发重试撤销' }),
      ),
    )

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)
    const cancelActivities = schedule.body.data.activities.filter(
      (activity: { activityType: string }) => activity.activityType === 'verification_cancelled',
    )

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      rejectedCount: responses.filter((response) => response.status === 400).length,
      settledAmountCents: schedule.body.data.settledAmountCents,
      unsettledAmountCents: schedule.body.data.unsettledAmountCents,
      cancelActivityCount: cancelActivities.length,
    }).toEqual({
      successCount: 1,
      rejectedCount: 7,
      settledAmountCents: 0,
      unsettledAmountCents: 50000,
      cancelActivityCount: 1,
    })
  })

  it('rejects confirm-collection on cancelled schedule', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-关闭后核销` }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '关闭测试' })
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('rejects confirm-collection without paymentChannel', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-缺通道收款` }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send({ amountCents: 10000, transactionDate: '2026-07-07' })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('rejects confirm-payment without paymentChannel', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send(
        schedulePayload({
          title: `${testPrefix}-缺通道付款`,
          counterpartyType: CounterpartyType.supplier,
          counterpartyName: '测试供应商',
        }),
      )
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${created.body.data.id}/confirm-payment`)
      .send({ amountCents: 10000, transactionDate: '2026-07-07' })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('confirms collection with paymentChannel on created transaction', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-通道收款`, amountCents: 40000 }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 40000, paymentChannel: PaymentChannel.WECHAT }))
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    const transactionId = verifications.body.data.items[0].transactionId
    const transaction = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transactionId}`)
      .expect(200)

    expect(transaction.body.data.paymentChannel).toBe(PaymentChannel.WECHAT)
    expect(transaction.body.data.direction).toBe('inflow')
  })

  it('confirms payment and settles payable with paymentChannel', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send(
        payablePayload({
          title: `${testPrefix}-登记付款`,
          amountCents: 35000,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${created.body.data.id}/confirm-payment`)
      .send(confirmPayload({ amountCents: 35000, paymentChannel: PaymentChannel.ALIPAY }))
      .expect(201)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(35000)
    expect(schedule.body.data.unsettledAmountCents).toBe(0)
    expect(schedule.body.data.status).toBe(PaymentScheduleStatus.SETTLED)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    const transactionId = verifications.body.data.items[0].transactionId
    const transaction = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transactionId}`)
      .expect(200)

    expect(transaction.body.data.paymentChannel).toBe(PaymentChannel.ALIPAY)
    expect(transaction.body.data.direction).toBe('outflow')
  })

  it('replays confirm-payment with the same idempotency key', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send(payablePayload({ title: `${testPrefix}-幂等登记付款` }))
      .expect(201)
    const idempotencyKey = `${testPrefix}-confirm-payment-retry`
    const payload = confirmPayload({ amountCents: 20000 })

    const first = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${created.body.data.id}/confirm-payment`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${created.body.data.id}/confirm-payment`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(replay.body.data.settledAmountCents).toBe(20000)
    expect(
      await prisma.financeVerification.count({
        where: { organizationId, paymentScheduleId: created.body.data.id },
      }),
    ).toBe(1)
  })

  it('rejects create transaction without paymentChannel', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        amountCents: 12000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: '缺少通道',
      })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('creates transaction with TX number and filters by departureId', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        amountCents: 12000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: '流水测试',
        departureId: otherDepartureId,
      })
      .expect(201)

    expect(response.body.data.transactionNo).toMatch(TX_NO_REGEX)
    expect(response.body.data.paymentChannel).toBe(PaymentChannel.BANK_TRANSFER)
    expect(response.body.data.departureId).toBe(otherDepartureId)
    expect(response.body.data.departureNo).toBeTruthy()
    expect(response.body.data.departureName).toBeTruthy()

    const list = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ departureId: otherDepartureId, pageSize: 50 })
      .expect(200)

    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1)
    expect(
      list.body.data.items.every(
        (item: {
          departureId: string | null
          departureNo: string | null
          departureName: string | null
        }) =>
          item.departureId === otherDepartureId &&
          Boolean(item.departureNo) &&
          Boolean(item.departureName),
      ),
    ).toBe(true)
  })

  it('replays transaction creation with the same idempotency key', async () => {
    const idempotencyKey = `${testPrefix}-create-transaction-retry`
    const payload = transactionPayload({ amountCents: 12345, notes: `${testPrefix}-幂等流水` })

    const first = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(
      await prisma.financeTransaction.count({
        where: { organizationId, notes: `${testPrefix}-幂等流水` },
      }),
    ).toBe(1)
  })

  it('rejects create transaction without departureId', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'outflow',
        paymentChannel: PaymentChannel.CASH,
        amountCents: 8000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-无发团流水`,
      })
      .expect(400)

    expect(response.body.message).toEqual(expect.stringMatching(/关联发团|departureId/i))
  })

  it('filters transactions by direction, transactionNo, status, and writeoffStatus', async () => {
    const filterPrefix = `${testPrefix}-filter-${Date.now()}`

    const filterPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${filterPrefix}-匹配旅行社`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    const receivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          title: `${filterPrefix}-应收`,
          amountCents: 100000,
          counterpartyId: filterPartner.id,
          counterpartyName: filterPartner.name,
        }),
      )
      .expect(201)

    const receivable2 = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          title: `${filterPrefix}-应收2`,
          amountCents: 30000,
          counterpartyId: filterPartner.id,
          counterpartyName: filterPartner.name,
        }),
      )
      .expect(201)

    const inflowTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          direction: 'inflow',
          amountCents: 50000,
          transactionDate: '2026-07-10',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: filterPartner.id,
          counterpartyName: `${filterPrefix}-旅行社A`,
        }),
      )
      .expect(201)

    const outflowTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          direction: 'outflow',
          amountCents: 20000,
          transactionDate: '2026-07-10',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
          counterpartyName: `${filterPrefix}-供应商B`,
        }),
      )
      .expect(201)

    const partialTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          amountCents: 50000,
          transactionDate: '2026-07-11',
          counterpartyId: filterPartner.id,
          counterpartyName: filterPartner.name,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.id}/link-transaction`)
      .send({ transactionId: partialTx.body.data.id, amountCents: 20000 })
      .expect(201)

    const doneTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          amountCents: 30000,
          transactionDate: '2026-07-11',
          counterpartyId: filterPartner.id,
          counterpartyName: filterPartner.name,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable2.body.data.id}/link-transaction`)
      .send({ transactionId: doneTx.body.data.id, amountCents: 30000 })
      .expect(201)

    const voidTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          amountCents: 10000,
          transactionDate: '2026-07-12',
          counterpartyType: CounterpartyType.partner,
          counterpartyId: filterPartner.id,
          counterpartyName: `${filterPrefix}-作废`,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${voidTx.body.data.id}/void`)
      .send({ voidReason: '筛选测试作废' })
      .expect(201)

    const inflowList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ direction: 'inflow', departureId, pageSize: 100, partnerKeyword: filterPrefix })
      .expect(200)

    expect(inflowList.body.data.items.some((item: { id: string }) => item.id === inflowTx.body.data.id)).toBe(
      true,
    )
    expect(
      inflowList.body.data.items.every((item: { direction: string }) => item.direction === 'inflow'),
    ).toBe(true)
    expect(
      inflowList.body.data.items.some((item: { id: string }) => item.id === outflowTx.body.data.id),
    ).toBe(false)

    const txNoList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({
        transactionNo: inflowTx.body.data.transactionNo.slice(-6),
        departureId,
        pageSize: 100,
      })
      .expect(200)

    expect(txNoList.body.data.items.some((item: { id: string }) => item.id === inflowTx.body.data.id)).toBe(
      true,
    )

    const voidedList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ status: 'voided', departureId, pageSize: 100, partnerKeyword: filterPrefix })
      .expect(200)

    expect(voidedList.body.data.items.some((item: { id: string }) => item.id === voidTx.body.data.id)).toBe(
      true,
    )
    expect(
      voidedList.body.data.items.every((item: { voidedAt: string | null }) => item.voidedAt !== null),
    ).toBe(true)

    const normalList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({
        status: 'normal',
        departureId,
        pageSize: 100,
        transactionNo: inflowTx.body.data.transactionNo,
      })
      .expect(200)

    expect(normalList.body.data.items.some((item: { id: string }) => item.id === inflowTx.body.data.id)).toBe(
      true,
    )
    expect(
      normalList.body.data.items.every((item: { voidedAt: string | null }) => item.voidedAt === null),
    ).toBe(true)

    const noneList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ writeoffStatus: 'none', departureId, pageSize: 100, partnerKeyword: filterPrefix })
      .expect(200)

    expect(noneList.body.data.items.some((item: { id: string }) => item.id === inflowTx.body.data.id)).toBe(
      true,
    )
    expect(
      noneList.body.data.items.some((item: { id: string }) => item.id === partialTx.body.data.id),
    ).toBe(false)
    expect(noneList.body.data.items.some((item: { id: string }) => item.id === doneTx.body.data.id)).toBe(
      false,
    )

    const partialList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({
        writeoffStatus: 'partial',
        departureId,
        pageSize: 100,
        transactionNo: partialTx.body.data.transactionNo,
      })
      .expect(200)

    expect(partialList.body.data.items).toHaveLength(1)
    expect(partialList.body.data.items[0].id).toBe(partialTx.body.data.id)
    expect(partialList.body.data.items[0].allocatedAmountCents).toBe(20000)
    expect(partialList.body.data.items[0].unallocatedAmountCents).toBe(30000)

    const doneList = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({
        writeoffStatus: 'done',
        departureId,
        pageSize: 100,
        transactionNo: doneTx.body.data.transactionNo,
      })
      .expect(200)

    expect(doneList.body.data.items).toHaveLength(1)
    expect(doneList.body.data.items[0].id).toBe(doneTx.body.data.id)
    expect(doneList.body.data.items[0].allocatedAmountCents).toBe(30000)
    expect(doneList.body.data.items[0].unallocatedAmountCents).toBe(0)

    const byId = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${partialTx.body.data.id}`)
      .expect(200)

    expect(byId.body.data.allocatedAmountCents).toBe(partialList.body.data.items[0].allocatedAmountCents)
    expect(byId.body.data.unallocatedAmountCents).toBe(
      partialList.body.data.items[0].unallocatedAmountCents,
    )
  })

  describe('verification create/cancel hardening', () => {
    it('rejects direction mismatch between receivable schedule and outflow transaction', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-方向错配`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ direction: 'outflow', amountCents: 50000 }))
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
          }),
        )
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('rejects counterparty mismatch between schedule and transaction', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-往来错配`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyType: CounterpartyType.supplier,
            counterpartyId: supplierId,
            counterpartyName: `${testPrefix}-supplier`,
          }),
        )
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
          }),
        )
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('rejects cancel without cancelReason', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-缺撤销原因`, amountCents: 50000 }))
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivable.body.data.id}/confirm-collection`)
        .send(confirmPayload())
        .expect(201)

      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      const response = await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
        .send({})
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('persists snapshot fields on create', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-快照字段`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 20000,
            verificationDate: '2026-07-08',
          }),
        )
        .expect(201)

      expect(response.body.data.verificationDate).toBe('2026-07-08')
      expect(response.body.data.createdBy).toBe(financeUserId)
      expect(response.body.data.billUnsettledAfterCents).toBe(30000)
    })

    it('persists remark on POST /finance/verifications', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-备注字段`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 20000,
            verificationDate: '2026-07-08',
            remark: '线下抹零说明',
          }),
        )
        .expect(201)

      expect(response.body.data.remark).toBe('线下抹零说明')
      expect(response.body.data.verificationDate).toBe('2026-07-08')
    })

    it('persists cancel audit fields on cancel', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-撤销审计`, amountCents: 50000 }))
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivable.body.data.id}/confirm-collection`)
        .send(confirmPayload())
        .expect(201)

      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      const verificationId = verifications.body.data.items[0].id

      const response = await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verificationId}/cancel`)
        .send({ cancelReason: '录入错误' })
        .expect(201)

      expect(response.body.data.cancelReason).toBe('录入错误')
      expect(response.body.data.cancelledBy).toBe(financeUserId)
    })

    it('replays verification cancellation with the same idempotency key', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-幂等撤销核销` }))
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivable.body.data.id}/confirm-collection`)
        .send(confirmPayload({ amountCents: 20000 }))
        .expect(201)
      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)
      const verificationId = verifications.body.data.items[0].id
      const idempotencyKey = `${testPrefix}-cancel-verification-retry`
      const payload = { cancelReason: '幂等撤销测试' }

      const first = await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verificationId}/cancel`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)
      const replay = await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verificationId}/cancel`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)

      expect(replay.body.data).toEqual(first.body.data)
      expect(replay.body.data.status).toBe('cancelled')
      expect(
        await prisma.financeVerification.count({
          where: { id: verificationId, organizationId, status: 'cancelled' },
        }),
      ).toBe(1)
    })
  })

  describe('match schedule via verifications', () => {
    it('creates verification for receivable schedule via POST /finance/verifications (match flow)', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-匹配流水等价`, amountCents: 50000 }))
        .expect(201)

      const beforeTransactions = await authRequest(app, financeToken)
        .get('/api/finance/transactions')
        .query({ departureId, pageSize: 100 })
        .expect(200)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      expect(transaction.body.data.transactionNo).toMatch(TX_NO_REGEX)

      await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: created.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 50000,
          }),
        )
        .expect(201)

      const afterTransactions = await authRequest(app, financeToken)
        .get('/api/finance/transactions')
        .query({ departureId, pageSize: 100 })
        .expect(200)

      expect(afterTransactions.body.data.total).toBe(beforeTransactions.body.data.total + 1)

      const schedule = await authRequest(app, financeToken)
        .get(`/api/finance/receivables/${created.body.data.id}`)
        .expect(200)

      expect(schedule.body.data.settledAmountCents).toBe(50000)
      expect(schedule.body.data.unsettledAmountCents).toBe(0)
      expect(schedule.body.data.status).toBe(PaymentScheduleStatus.SETTLED)

      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      expect(verifications.body.data.items).toHaveLength(1)
      expect(verifications.body.data.items[0].verificationNo).toMatch(CL_NO_REGEX)
      expect(verifications.body.data.items[0].transactionId).toBe(transaction.body.data.id)
      expect(verifications.body.data.items[0].transactionNo).toMatch(TX_NO_REGEX)
      expect(verifications.body.data.items[0].scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
      expect(verifications.body.data.items[0].amountCents).toBe(50000)

      const linkedTransaction = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect(linkedTransaction.body.data.allocatedAmountCents).toBe(50000)
      expect(linkedTransaction.body.data.unallocatedAmountCents).toBe(0)
      expect(linkedTransaction.body.data.verificationCount).toBe(1)
      expect(linkedTransaction.body.data.lastVerificationAt).toEqual(expect.any(String))
      expect(linkedTransaction.body.data.verifications).toHaveLength(1)
      expect(linkedTransaction.body.data.verifications[0].verificationNo).toMatch(CL_NO_REGEX)
      expect(linkedTransaction.body.data.verifications[0].scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
      expect(linkedTransaction.body.data.verifications[0].amountCents).toBe(50000)
    })

    it('replays verification creation with the same idempotency key', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-幂等核销` }))
        .expect(201)
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload())
        .expect(201)
      const payload = verificationPayload({
        paymentScheduleId: receivable.body.data.id,
        transactionId: transaction.body.data.id,
        amountCents: 20000,
      })
      const idempotencyKey = `${testPrefix}-create-verification-retry`

      const first = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)
      const replay = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)

      expect(replay.body.data).toEqual(first.body.data)
      expect(
        await prisma.financeVerification.count({
          where: { organizationId, paymentScheduleId: receivable.body.data.id },
        }),
      ).toBe(1)
    })
  })

  describe('verify from transaction', () => {
    it('creates verification via POST /finance/verifications and updates transaction writeoff status', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-去核销`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const firstVerification = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 20000,
          }),
        )
        .expect(201)

      expect(firstVerification.body.data.verificationNo).toMatch(CL_NO_REGEX)
      expect(firstVerification.body.data.transactionId).toBe(transaction.body.data.id)
      expect(firstVerification.body.data.amountCents).toBe(20000)

      const partialDetail = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect(partialDetail.body.data.allocatedAmountCents).toBe(20000)
      expect(partialDetail.body.data.unallocatedAmountCents).toBe(30000)

      const partialList = await authRequest(app, financeToken)
        .get('/api/finance/transactions')
        .query({
          writeoffStatus: 'partial',
          departureId,
          pageSize: 100,
          transactionNo: transaction.body.data.transactionNo,
        })
        .expect(200)

      expect(partialList.body.data.items).toHaveLength(1)
      expect(partialList.body.data.items[0].id).toBe(transaction.body.data.id)

      const secondVerification = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 30000,
          }),
        )
        .expect(201)

      expect(secondVerification.body.data.verificationNo).toMatch(CL_NO_REGEX)

      const doneDetail = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect(doneDetail.body.data.allocatedAmountCents).toBe(50000)
      expect(doneDetail.body.data.unallocatedAmountCents).toBe(0)
    })

    it('filters verifications by transactionNo exact match', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-核销过滤`, amountCents: 30000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 30000 }))
        .expect(201)

      const otherTransaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 10000, transactionDate: '2026-07-08' }))
        .expect(201)

      await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 30000,
          }),
        )
        .expect(201)

      const filtered = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          transactionNo: transaction.body.data.transactionNo,
          transactionNoMatch: 'exact',
          pageSize: 10,
        })
        .expect(200)

      expect(filtered.body.data.items).toHaveLength(1)
      expect(filtered.body.data.items[0].transactionNo).toBe(transaction.body.data.transactionNo)

      const caseInsensitive = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          transactionNo: String(transaction.body.data.transactionNo).toLowerCase(),
          transactionNoMatch: 'exact',
          pageSize: 10,
        })
        .expect(200)

      expect(caseInsensitive.body.data.items).toHaveLength(1)

      const partialExact = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          transactionNo: String(transaction.body.data.transactionNo).slice(0, 8),
          transactionNoMatch: 'exact',
          pageSize: 10,
        })
        .expect(200)

      expect(partialExact.body.data.items).toHaveLength(0)

      const otherFiltered = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          transactionNo: otherTransaction.body.data.transactionNo,
          transactionNoMatch: 'exact',
          pageSize: 10,
        })
        .expect(200)

      expect(otherFiltered.body.data.items).toHaveLength(0)
    })
  })

  describe('verification list and detail', () => {
    async function seedListFixture() {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(
          schedulePayload({
            title: `${testPrefix}-列表应收`,
            amountCents: 100000,
            departureId,
          }),
        )
        .expect(201)

      const payable = await authRequest(app, financeToken)
        .post('/api/finance/payables')
        .send(
          payablePayload({
            title: `${testPrefix}-列表应付`,
            amountCents: 80000,
            departureId: otherDepartureId,
          }),
        )
        .expect(201)

      const receivableTx = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 100000, transactionDate: '2026-07-05' }))
        .expect(201)

      const payableTx = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            direction: 'outflow',
            amountCents: 80000,
            transactionDate: '2026-07-20',
            counterpartyType: CounterpartyType.supplier,
            counterpartyId: supplierId,
            counterpartyName: `${testPrefix}-supplier`,
            departureId: otherDepartureId,
          }),
        )
        .expect(201)

      const earlyVerification = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: receivableTx.body.data.id,
            amountCents: 30000,
            verificationDate: '2026-07-01',
          }),
        )
        .expect(201)

      const lateVerification = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: payable.body.data.id,
            transactionId: payableTx.body.data.id,
            amountCents: 40000,
            verificationDate: '2026-07-15',
          }),
        )
        .expect(201)

      return {
        receivable,
        payable,
        receivableTx,
        payableTx,
        earlyVerification,
        lateVerification,
      }
    }

    it('returns enriched list items with transactionNo and scheduleNo', async () => {
      const fixture = await seedListFixture()

      const list = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: fixture.receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      expect(list.body.data.items).toHaveLength(1)
      const item = list.body.data.items[0]
      expect(item.transactionNo).toBe(fixture.receivableTx.body.data.transactionNo)
      expect(item.scheduleNo).toBe(fixture.receivable.body.data.scheduleNo)
      expect(item.direction).toBe('receivable')
      expect(item.departureNo).toContain(testPrefix)
      expect(item.createdByName).toEqual(expect.any(String))
    })

    it('filters by verification date range', async () => {
      const fixture = await seedListFixture()

      const inRange = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          verificationDateStart: '2026-07-10',
          verificationDateEnd: '2026-07-20',
          scheduleNo: fixture.payable.body.data.scheduleNo,
          pageSize: 10,
        })
        .expect(200)

      expect(inRange.body.data.items).toHaveLength(1)
      expect(inRange.body.data.items[0].direction).toBe('payable')
      expect(inRange.body.data.items[0].verificationDate).toBe('2026-07-15')

      const outOfRange = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          verificationDateStart: '2026-07-10',
          verificationDateEnd: '2026-07-20',
          scheduleNo: fixture.receivable.body.data.scheduleNo,
          pageSize: 10,
        })
        .expect(200)

      expect(outOfRange.body.data.items).toHaveLength(0)
    })

    it('filters by direction', async () => {
      await seedListFixture()

      const receivableOnly = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ direction: 'receivable', pageSize: 100 })
        .expect(200)

      expect(receivableOnly.body.data.items.length).toBeGreaterThan(0)
      expect(receivableOnly.body.data.items.every((item: { direction: string }) => item.direction === 'receivable')).toBe(true)
    })

    it('filters by status', async () => {
      const fixture = await seedListFixture()

      await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${fixture.earlyVerification.body.data.id}/cancel`)
        .send({ cancelReason: '测试撤销' })
        .expect(201)

      const cancelled = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ status: 'cancelled', scheduleNo: fixture.receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      expect(cancelled.body.data.items).toHaveLength(1)
      expect(cancelled.body.data.items[0].status).toBe('cancelled')

      const normal = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ status: 'normal', scheduleNo: fixture.receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      expect(normal.body.data.items).toHaveLength(0)
    })

    it('filters by transactionNo contains', async () => {
      const fixture = await seedListFixture()
      const partialNo = fixture.receivableTx.body.data.transactionNo.slice(0, 8)

      const filtered = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ transactionNo: partialNo, pageSize: 10 })
        .expect(200)

      expect(filtered.body.data.items.length).toBeGreaterThan(0)
      expect(filtered.body.data.items.every((item: { transactionNo: string }) =>
        item.transactionNo.includes(partialNo),
      )).toBe(true)
    })

    it('filters by scheduleNo contains', async () => {
      const fixture = await seedListFixture()
      const partialNo = fixture.receivable.body.data.scheduleNo.slice(0, 6)

      const filtered = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: partialNo, pageSize: 10 })
        .expect(200)

      expect(filtered.body.data.items.length).toBeGreaterThan(0)
      expect(filtered.body.data.items.every((item: { scheduleNo: string }) =>
        item.scheduleNo.includes(partialNo),
      )).toBe(true)
    })

    it('filters by scheduleNo exact match', async () => {
      const fixture = await seedListFixture()
      const scheduleNo = fixture.receivable.body.data.scheduleNo as string

      const filtered = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      expect(filtered.body.data.items.length).toBeGreaterThan(0)
      expect(
        filtered.body.data.items.every((item: { scheduleNo: string }) => item.scheduleNo === scheduleNo),
      ).toBe(true)

      const partialExact = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({
          scheduleNo: scheduleNo.slice(0, 6),
          scheduleNoMatch: 'exact',
          pageSize: 10,
        })
        .expect(200)

      expect(partialExact.body.data.items).toHaveLength(0)
    })

    it('filters by departure keyword', async () => {
      await seedListFixture()

      const byNo = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ departureKeyword: `${testPrefix}-dep-other`, pageSize: 10 })
        .expect(200)

      expect(byNo.body.data.items.length).toBeGreaterThan(0)
      expect(byNo.body.data.items.every((item: { departureNo: string }) =>
        item.departureNo.includes(`${testPrefix}-dep-other`),
      )).toBe(true)

      const byName = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ departureKeyword: '其他发团', pageSize: 10 })
        .expect(200)

      expect(byName.body.data.items.length).toBeGreaterThan(0)
    })

    it('returns detail with verification, transaction, and schedule blocks', async () => {
      const fixture = await seedListFixture()

      const detail = await authRequest(app, financeToken)
        .get(`/api/finance/verifications/${fixture.earlyVerification.body.data.id}`)
        .expect(200)

      expect(detail.body.data.verification).toMatchObject({
        id: fixture.earlyVerification.body.data.id,
        transactionNo: fixture.receivableTx.body.data.transactionNo,
        scheduleNo: fixture.receivable.body.data.scheduleNo,
        direction: 'receivable',
      })
      expect(detail.body.data.transaction.transactionNo).toBe(
        fixture.receivableTx.body.data.transactionNo,
      )
      expect(detail.body.data.transaction.allocatedAmountCents).toEqual(expect.any(Number))
      expect(detail.body.data.transaction.unallocatedAmountCents).toEqual(expect.any(Number))
      expect(detail.body.data.schedule.scheduleNo).toBe(fixture.receivable.body.data.scheduleNo)
      expect(detail.body.data.schedule.settledAmountCents).toEqual(expect.any(Number))
      expect(detail.body.data.schedule.unsettledAmountCents).toEqual(expect.any(Number))
      expect(detail.body.data.schedule.status).toEqual(expect.any(String))
    })

    it('preserves billUnsettledAfterCents snapshot after subsequent partial verification', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-快照不变`, amountCents: 100000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 100000 }))
        .expect(201)

      const first = await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 30000,
          }),
        )
        .expect(201)

      expect(first.body.data.billUnsettledAfterCents).toBe(70000)

      await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 20000,
          }),
        )
        .expect(201)

      const list = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)

      const firstItem = list.body.data.items.find(
        (item: { id: string }) => item.id === first.body.data.id,
      )
      expect(firstItem.billUnsettledAfterCents).toBe(70000)
    })
  })

  it('allows coordinator to GET /finance/receivables (ADR-0016 early-launch menus)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/finance/receivables')
      .expect(200)

    expect(response.body.data.items).toEqual(expect.any(Array))
  })

  it('rejects an existing finance token after the employee is disabled', async () => {
    await prisma.user.update({
      where: { id: financeUserId },
      data: { status: UserStatus.disabled },
    })

    const response = await authRequest(app, financeToken).get('/api/finance/transactions')

    await prisma.user.update({
      where: { id: financeUserId },
      data: { status: UserStatus.enabled },
    })

    expect(response.status).toBe(401)
  })

  it('allows coordinator finance mutations (ADR-0016 early-launch menus)', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-权限测试` }))
      .expect(201)

    const confirm = await authRequest(app, coordinatorToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(201)

    expect(confirm.body.data).toBeTruthy()

    const createTx = await authRequest(app, coordinatorToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.OTHER,
        amountCents: 10000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: '权限测试',
        departureId,
      })
      .expect(201)

    expect(createTx.body.data.amountCents).toBe(10000)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: created.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    expect(verifications.body.data.items.length).toBeGreaterThan(0)
    const cancel = await authRequest(app, coordinatorToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '计调撤销核销' })
      .expect(201)

    expect(cancel.body.data).toBeTruthy()
  })

  it('never commits both amount adjustment and verification under concurrency', async () => {
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 50000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const schedule = generated.body.data.schedules[0]

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedule.id}/confirm-collection`)
      .send(
        confirmPayload({
          amountCents: 10000,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: undefined,
          counterpartyName: sourceOrder.body.data.displayName,
        }),
      )
      .expect(201)
    const existingVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedule.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${existingVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '建立调额所需财务履历' })
      .expect(201)

    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(
        transactionPayload({
          amountCents: 50000,
          counterpartyType: CounterpartyType.guest,
          counterpartyId: sourceOrder.body.data.id,
          counterpartyName: sourceOrder.body.data.displayName,
        }),
      )
      .expect(201)

    const requests = Array.from({ length: 8 }, () => [
      authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: schedule.id,
            transactionId: transaction.body.data.id,
            amountCents: 50000,
          }),
        ),
      authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${schedule.id}/adjust-amount`)
        .send({ amountCents: 10000, adjustReason: '并发调额竞争' }),
    ]).flat()
    const responses = await Promise.all(requests)

    const verificationSuccessCount = responses.filter(
      (response, index) => index % 2 === 0 && response.status === 201,
    ).length
    const adjustmentSuccessCount = responses.filter(
      (response, index) => index % 2 === 1 && response.status === 201,
    ).length
    const scheduleAfter = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedule.id}`)
      .expect(200)

    expect({
      successfulMutationCount: verificationSuccessCount + adjustmentSuccessCount,
      conflictingSuccess: verificationSuccessCount > 0 && adjustmentSuccessCount > 0,
      amountCents: scheduleAfter.body.data.amountCents,
      settledAmountCents: scheduleAfter.body.data.settledAmountCents,
      allocationWithinAmount:
        scheduleAfter.body.data.settledAmountCents <= scheduleAfter.body.data.amountCents,
      adjustmentActivityCount: scheduleAfter.body.data.activities.filter(
        (activity: { activityType: string }) => activity.activityType === 'amount_adjust',
      ).length,
    }).toEqual({
      successfulMutationCount: 1,
      conflictingSuccess: false,
      amountCents: verificationSuccessCount === 1 ? 50000 : 10000,
      settledAmountCents: verificationSuccessCount === 1 ? 50000 : 0,
      allocationWithinAmount: true,
      adjustmentActivityCount: verificationSuccessCount === 1 ? 0 : 1,
    })
  })

  it('replays amount adjustment with the same idempotency key', async () => {
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 50000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const schedule = generated.body.data.schedules[0]

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedule.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(201)
    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedule.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '建立幂等调额履历' })
      .expect(201)

    const idempotencyKey = `${testPrefix}-adjust-amount-retry`
    const payload = { amountCents: 40000, adjustReason: '幂等调额测试' }
    const first = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedule.id}/adjust-amount`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)
    const replay = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedule.id}/adjust-amount`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(replay.body.data.amountCents).toBe(40000)
    expect(
      await prisma.paymentScheduleActivity.count({
        where: {
          organizationId,
          paymentScheduleId: schedule.id,
          activityType: 'amount_adjust',
        },
      }),
    ).toBe(1)
  })

  describe('PUT /finance/transactions/:id', () => {
    function updatePayload(overrides: Record<string, unknown> = {}) {
      return {
        direction: 'outflow',
        paymentChannel: PaymentChannel.WECHAT,
        amountCents: 88000,
        transactionDate: '2026-07-15',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        departureId,
        notes: `${testPrefix}-updated`,
        ...overrides,
      }
    }

    it('updates unallocated transaction and persists changes', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            amountCents: 50000,
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      const originalNo = created.body.data.transactionNo

      const updated = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${created.body.data.id}`)
        .send(updatePayload())
        .expect(200)

      expect(updated.body.data.amountCents).toBe(88000)
      expect(updated.body.data.direction).toBe('outflow')
      expect(updated.body.data.paymentChannel).toBe(PaymentChannel.WECHAT)
      expect(updated.body.data.transactionDate).toBe('2026-07-15')
      expect(updated.body.data.counterpartyType).toBe(CounterpartyType.supplier)
      expect(updated.body.data.counterpartyId).toBe(supplierId)
      expect(updated.body.data.counterpartyName).toBe(`${testPrefix}-supplier`)
      expect(updated.body.data.notes).toBe(`${testPrefix}-updated`)
      expect(updated.body.data.transactionNo).toBe(originalNo)
      expect(updated.body.data.allocatedAmountCents).toBe(0)

      const fetched = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${created.body.data.id}`)
        .expect(200)

      expect(fetched.body.data.amountCents).toBe(88000)
      expect(fetched.body.data.direction).toBe('outflow')
      expect(fetched.body.data.counterpartyId).toBe(supplierId)
      expect(fetched.body.data.counterpartyName).toBe(`${testPrefix}-supplier`)
    })

    it('replays transaction update with the same idempotency key', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ notes: `${testPrefix}-幂等编辑前` }))
        .expect(201)
      const idempotencyKey = `${testPrefix}-update-transaction-retry`
      const payload = updatePayload({ notes: `${testPrefix}-幂等编辑后` })

      const first = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${created.body.data.id}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(200)
      const replay = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${created.body.data.id}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(200)

      expect(replay.body.data).toEqual(first.body.data)
    })

    it('rejects update when transaction has verification allocation', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-编辑拦截-已核销` }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivable.body.data.id}/link-transaction`)
        .send({ transactionId: transaction.body.data.id, amountCents: 50000 })
        .expect(201)

      const response = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${transaction.body.data.id}`)
        .send(updatePayload({ direction: 'inflow', counterpartyType: CounterpartyType.partner, counterpartyId: partnerId }))
        .expect(400)

      expect(response.body.message).toContain('核销')
    })

    it('rejects update when transaction is voided', async () => {
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
        .send({ voidReason: '编辑拦截测试作废' })
        .expect(201)

      const response = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${transaction.body.data.id}`)
        .send(updatePayload({ direction: 'inflow', counterpartyType: CounterpartyType.partner, counterpartyId: partnerId }))
        .expect(400)

      expect(response.body.message).toContain('作废')
    })

    it('rejects partner update without counterpartyId', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      const response = await authRequest(app, financeToken)
        .put(`/api/finance/transactions/${created.body.data.id}`)
        .send(
          updatePayload({
            direction: 'inflow',
            counterpartyType: CounterpartyType.partner,
            counterpartyId: undefined,
            counterpartyName: '仅名称',
          }),
        )
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('never commits an incompatible transaction edit with verification under concurrency', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-编辑核销竞争`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const requests = Array.from({ length: 8 }, () => [
        authRequest(app, financeToken)
          .post('/api/finance/verifications')
          .send(
            verificationPayload({
              paymentScheduleId: receivable.body.data.id,
              transactionId: transaction.body.data.id,
              amountCents: 50000,
            }),
          ),
        authRequest(app, financeToken)
          .put(`/api/finance/transactions/${transaction.body.data.id}`)
          .send(
            updatePayload({
              direction: 'inflow',
              amountCents: 10000,
              counterpartyType: CounterpartyType.partner,
              counterpartyId: partnerId,
              departureId,
            }),
          ),
      ]).flat()
      const responses = await Promise.all(requests)

      const verificationSuccessCount = responses.filter(
        (response, index) => index % 2 === 0 && response.status === 201,
      ).length
      const editSuccessCount = responses.filter(
        (response, index) => index % 2 === 1 && response.status === 200,
      ).length
      const detail = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect({
        conflictingSuccess: verificationSuccessCount > 0 && editSuccessCount > 0,
        amountCents: detail.body.data.amountCents,
        allocatedAmountCents: detail.body.data.allocatedAmountCents,
        unallocatedAmountCents: detail.body.data.unallocatedAmountCents,
        allocationWithinAmount:
          detail.body.data.allocatedAmountCents <= detail.body.data.amountCents,
      }).toEqual({
        conflictingSuccess: false,
        amountCents: verificationSuccessCount === 1 ? 50000 : 10000,
        allocatedAmountCents: verificationSuccessCount === 1 ? 50000 : 0,
        unallocatedAmountCents: verificationSuccessCount === 1 ? 0 : 10000,
        allocationWithinAmount: true,
      })
    })
  })

  describe('POST /finance/transactions/:id/void', () => {
    it('rejects void without voidReason', async () => {
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
        .send({})
        .expect(400)

      expect(response.body.code).toBe(400)
    })

    it('voids unallocated transaction with reason and persists voidReason', async () => {
      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      const voided = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
        .send({ voidReason: '录入错误' })
        .expect(201)

      expect(voided.body.data.voidedAt).not.toBeNull()
      expect(voided.body.data.voidReason).toBe('录入错误')

      const fetched = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect(fetched.body.data.voidedAt).not.toBeNull()
      expect(fetched.body.data.voidReason).toBe('录入错误')
    })

    it('replays transaction void with the same idempotency key', async () => {
      const created = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ notes: `${testPrefix}-幂等作废` }))
        .expect(201)
      const idempotencyKey = `${testPrefix}-void-transaction-retry`
      const payload = { voidReason: '幂等作废测试' }

      const first = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${created.body.data.id}/void`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)
      const replay = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${created.body.data.id}/void`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201)

      expect(replay.body.data).toEqual(first.body.data)
      expect(replay.body.data.voidReason).toBe('幂等作废测试')
    })

    it('rejects void when transaction has verification allocation', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-作废拦截-已核销` }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(
          transactionPayload({
            counterpartyId: partnerId,
            counterpartyName: `${testPrefix}-partner`,
          }),
        )
        .expect(201)

      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${receivable.body.data.id}/link-transaction`)
        .send({ transactionId: transaction.body.data.id, amountCents: 20000 })
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
        .send({ voidReason: '录入错误' })
        .expect(400)

      expect(response.body.message).toContain('核销')
    })

    it('never commits both transaction void and verification under concurrency', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(schedulePayload({ title: `${testPrefix}-作废核销竞争`, amountCents: 50000 }))
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      const requests = Array.from({ length: 8 }, () => [
        authRequest(app, financeToken)
          .post('/api/finance/verifications')
          .send(
            verificationPayload({
              paymentScheduleId: receivable.body.data.id,
              transactionId: transaction.body.data.id,
              amountCents: 50000,
            }),
          ),
        authRequest(app, financeToken)
          .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
          .send({ voidReason: '并发作废竞争' }),
      ]).flat()
      const responses = await Promise.all(requests)

      const verificationSuccessCount = responses.filter(
        (response, index) => index % 2 === 0 && response.status === 201,
      ).length
      const voidSuccessCount = responses.filter(
        (response, index) => index % 2 === 1 && response.status === 201,
      ).length
      const detail = await authRequest(app, financeToken)
        .get(`/api/finance/transactions/${transaction.body.data.id}`)
        .expect(200)

      expect({
        successfulMutationCount: verificationSuccessCount + voidSuccessCount,
        verificationSuccessCount,
        voidSuccessCount,
        allocatedAmountCents: detail.body.data.allocatedAmountCents,
        isVoided: detail.body.data.voidedAt != null,
        stateIsConsistent: !(
          detail.body.data.allocatedAmountCents > 0 && detail.body.data.voidedAt != null
        ),
      }).toEqual({
        successfulMutationCount: 1,
        verificationSuccessCount: expect.any(Number),
        voidSuccessCount: expect.any(Number),
        allocatedAmountCents: verificationSuccessCount === 1 ? 50000 : 0,
        isVoided: voidSuccessCount === 1,
        stateIsConsistent: true,
      })
    })

    it('rejects void for an unlinked transaction with verification history in an archived departure', async () => {
      const receivable = await authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send(
          schedulePayload({
            departureId: otherDepartureId,
            title: `${testPrefix}-归档历史流水`,
            amountCents: 50000,
          }),
        )
        .expect(201)

      const transaction = await authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send(transactionPayload({ amountCents: 50000 }))
        .expect(201)

      await authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: receivable.body.data.id,
            transactionId: transaction.body.data.id,
            amountCents: 50000,
          }),
        )
        .expect(201)

      const verifications = await authRequest(app, financeToken)
        .get('/api/finance/verifications')
        .query({ scheduleNo: receivable.body.data.scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
        .expect(200)
      await authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
        .send({ cancelReason: '归档前撤销核销' })
        .expect(201)

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${otherDepartureId}/close`)
        .send({ reason: '验证历史关联流水的归档写保护' })
        .expect(201)

      const response = await authRequest(app, financeToken)
        .post(`/api/finance/transactions/${transaction.body.data.id}/void`)
        .send({ voidReason: '归档期间不应允许' })

      await authRequest(app, coordinatorToken)
        .post(`/api/departures/${otherDepartureId}/unarchive`)
        .send({ reason: '测试完成恢复发团' })
        .expect(201)

      expect(response.status).toBe(409)
      expect(response.body.message).toBe('发团已关闭，不可作废流水')
    })
  })

  it('serializes departure archive behind an in-flight finance write', async () => {
    const departure = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-归档竞争`,
        routeName: '归档竞争路线',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        ownerUserId,
      })
      .expect(201)
    const schedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(
        schedulePayload({
          departureId: departure.body.data.id,
          title: `${testPrefix}-归档竞争应收`,
        }),
      )
      .expect(201)
    const transaction = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send(transactionPayload({ departureId: departure.body.data.id }))
      .expect(201)

    const sequence = await prisma.documentSequence.findFirstOrThrow({
      where: { organizationId, documentType: 'cl' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    let releaseSequenceBarrier: (() => void) | undefined
    let markSequenceLocked: (() => void) | undefined
    const sequenceLocked = new Promise<void>((resolve) => {
      markSequenceLocked = resolve
    })
    const sequenceBarrier = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM document_sequences
          WHERE id = ${sequence.id}
          FOR UPDATE
        `
        markSequenceLocked?.()
        await new Promise<void>((resolve) => {
          releaseSequenceBarrier = resolve
        })
      },
      { timeout: 15000 },
    )
    await sequenceLocked

    const completionOrder: string[] = []
    const verificationPromise = Promise.resolve(
      authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send(
          verificationPayload({
            paymentScheduleId: schedule.body.data.id,
            transactionId: transaction.body.data.id,
          }),
        ),
    ).then((response) => {
      completionOrder.push('verification')
      return response
    })

    let verificationBlocked = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [state] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%document_sequences%'
        ) AS blocked
      `
      if (state?.blocked) {
        verificationBlocked = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    let closeCompleted = false
    const closePromise = Promise.resolve(
      authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.body.data.id}/close`)
        .send({ reason: '并发归档屏障验证' }),
    ).then((response) => {
      closeCompleted = true
      completionOrder.push('close')
      return response
    })

    let closeBlocked = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (closeCompleted) {
        break
      }
      const [state] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%departures%'
        ) AS blocked
      `
      if (state?.blocked) {
        closeBlocked = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const closeCompletedBeforeFinanceCommit = closeCompleted

    releaseSequenceBarrier?.()
    const [verificationResponse, closeResponse] = await Promise.all([
      verificationPromise,
      closePromise,
      sequenceBarrier,
    ])

    expect({
      verificationBlocked,
      closeBlocked,
      closeCompletedBeforeFinanceCommit,
      verificationStatus: verificationResponse.status,
      closeStatus: closeResponse.status,
      finalStatus: closeResponse.body.data.status,
      completionOrder,
    }).toEqual({
      verificationBlocked: true,
      closeBlocked: true,
      closeCompletedBeforeFinanceCommit: false,
      verificationStatus: 201,
      closeStatus: 201,
      finalStatus: 'closed',
      completionOrder: expect.arrayContaining(['verification', 'close']),
    })
  })
})
