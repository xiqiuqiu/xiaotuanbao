import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleStatus } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * C-layer: Departure ↔ Payment Schedule settlement coupling.
 *
 * Seam: HTTP APIs (departure transition / finance schedules / verifications /
 * source-order & resource generation).
 *
 * @see finance.e2e-spec.ts — AR cancel-verification rolls settled Departure back
 * @see finance-journey.e2e-spec.ts #91 — reopen on settled Departure rolls back
 *      and does not auto re-settle (C6 anchor)
 */
describe('Departure–finance settlement transitions (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let financeUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-dep-fin-tx-${Date.now()}`

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

    const financeUser = await prisma.user.findFirst({
      where: { username: 'acai', deletedAt: null },
    })
    if (!financeUser) {
      throw new Error('Seed user acai not found')
    }
    financeUserId = financeUser.id

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
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: { departure: { name: { startsWith: testPrefix } } },
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
                  departure: { name: { startsWith: testPrefix } },
                },
              },
            },
          },
        ],
      },
    })
    await prisma.paymentScheduleActivity.deleteMany({
      where: {
        organizationId,
        paymentSchedule: { departure: { name: { startsWith: testPrefix } } },
      },
    })
    await prisma.departureSettlementHistory.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
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
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture(suffix: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-${suffix}`,
        routeName: '结算联动路线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function seedOps(departureId: string) {
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 100_000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '联动段',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '联动',
      })
      .expect(201)

    const resource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '用车',
        amountCents: 80_000,
      })
      .expect(201)

    return {
      sourceOrderId: sourceOrder.body.data.id as string,
      displayName: sourceOrder.body.data.displayName as string,
      segmentId: segment.body.data.id as string,
      resourceId: resource.body.data.id as string,
    }
  }

  async function generateSchedules(ops: {
    sourceOrderId: string
    resourceId: string
  }) {
    const receivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${ops.sourceOrderId}/generate-receivables`)
      .expect(201)
    const payable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${ops.resourceId}/generate-payable`)
      .expect(201)
    return {
      receivableScheduleId: receivable.body.data.schedules[0].id as string,
      receivableScheduleNo: receivable.body.data.schedules[0].scheduleNo as string,
      payableScheduleId: payable.body.data.schedule.id as string,
      payableScheduleNo: payable.body.data.schedule.scheduleNo as string,
    }
  }

  async function settleSchedulesAndMarkDeparture(params: {
    departureId: string
    receivableScheduleId: string
    payableScheduleId: string
    displayName: string
    receivableCents?: number
    payableCents?: number
  }) {
    const receivableCents = params.receivableCents ?? 200_000
    const payableCents = params.payableCents ?? 80_000

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${params.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: receivableCents,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: params.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${params.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: payableCents,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${params.departureId}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${params.departureId}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
  }

  async function firstVerificationId(scheduleNo: string) {
    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    return verifications.body.data.items[0].id as string
  }

  it('C1: cancelling last payable verification on settled Departure rolls back atomically', async () => {
    const departure = await createDeparture('c1-ap-cancel')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)
    await settleSchedulesAndMarkDeparture({
      departureId: departure.id,
      ...schedules,
      displayName: ops.displayName,
    })

    const verificationId = await firstVerificationId(schedules.payableScheduleNo)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .send({ cancelReason: '应付核销录错，需回退发团结清' })
      .expect(201)

    const [departureAfter, payableAfter] = await Promise.all([
      authRequest(app, coordinatorToken).get(`/api/departures/${departure.id}`).expect(200),
      authRequest(app, financeToken)
        .get(`/api/finance/payables/${schedules.payableScheduleId}`)
        .expect(200),
    ])

    expect({
      departureStatus: departureAfter.body.data.status,
      payableStatus: payableAfter.body.data.status,
      settledAmountCents: payableAfter.body.data.settledAmountCents,
      unsettledAmountCents: payableAfter.body.data.unsettledAmountCents,
      settlementHistory: departureAfter.body.data.settlementHistory,
    }).toEqual({
      departureStatus: DepartureStatus.pending_settlement,
      payableStatus: PaymentScheduleStatus.PENDING,
      settledAmountCents: 0,
      unsettledAmountCents: 80_000,
      settlementHistory: [
        expect.objectContaining({
          triggerPaymentScheduleId: schedules.payableScheduleId,
          reason: '应付核销录错，需回退发团结清',
          previousStatus: DepartureStatus.settled,
          newStatus: DepartureStatus.pending_settlement,
          operatedBy: financeUserId,
        }),
      ],
    })
  })

  it('C2: cancelling one open schedule reopens Departure while sibling stays settled', async () => {
    const departure = await createDeparture('c2-multi-schedule')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)
    await settleSchedulesAndMarkDeparture({
      departureId: departure.id,
      ...schedules,
      displayName: ops.displayName,
    })

    const payableVerificationId = await firstVerificationId(schedules.payableScheduleNo)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${payableVerificationId}/cancel`)
      .send({ cancelReason: '仅回退应付核销' })
      .expect(201)

    const [departureAfter, receivableAfter, payableAfter] = await Promise.all([
      authRequest(app, coordinatorToken).get(`/api/departures/${departure.id}`).expect(200),
      authRequest(app, financeToken)
        .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
        .expect(200),
      authRequest(app, financeToken)
        .get(`/api/finance/payables/${schedules.payableScheduleId}`)
        .expect(200),
    ])

    expect({
      departureStatus: departureAfter.body.data.status,
      receivableStatus: receivableAfter.body.data.status,
      receivableSettledCents: receivableAfter.body.data.settledAmountCents,
      payableStatus: payableAfter.body.data.status,
      payableUnsettledCents: payableAfter.body.data.unsettledAmountCents,
    }).toEqual({
      departureStatus: DepartureStatus.pending_settlement,
      receivableStatus: PaymentScheduleStatus.SETTLED,
      receivableSettledCents: 200_000,
      payableStatus: PaymentScheduleStatus.PENDING,
      payableUnsettledCents: 80_000,
    })
  })

  it('C3: adjust-amount on settled Departure requires cancel-verification chain first', async () => {
    const departure = await createDeparture('c3-adjust-chain')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)
    await settleSchedulesAndMarkDeparture({
      departureId: departure.id,
      ...schedules,
      displayName: ops.displayName,
    })

    const rejectedWhileVerified = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/adjust-amount`)
      .send({ amountCents: 90_000, adjustReason: '结清后直接调价应被拒' })
      .expect(400)
    expect(rejectedWhileVerified.body.message).toBe(
      '仍有有效核销时不可调整约定金额，请先撤销相关核销',
    )

    const verificationId = await firstVerificationId(schedules.payableScheduleNo)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .send({ cancelReason: '先撤核销再调价' })
      .expect(201)

    const afterCancel = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterCancel.body.data.status).toBe(DepartureStatus.pending_settlement)

    const adjusted = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/adjust-amount`)
      .send({ amountCents: 90_000, adjustReason: '撤核销后调整供应商报价' })
      .expect(201)

    expect(adjusted.body.data).toMatchObject({
      id: schedules.payableScheduleId,
      amountCents: 90_000,
      settledAmountCents: 0,
      unsettledAmountCents: 90_000,
      status: PaymentScheduleStatus.PENDING,
    })
  })

  it('C4: settled Departure rejects new receivable/payable generation and manual create', async () => {
    const departure = await createDeparture('c4-no-new-obligation')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)
    await settleSchedulesAndMarkDeparture({
      departureId: departure.id,
      ...schedules,
      displayName: ops.displayName,
    })

    const extraSource = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 50_000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const extraResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${ops.segmentId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '加车',
        amountCents: 30_000,
      })
      .expect(201)

    const genReceivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${extraSource.body.data.id}/generate-receivables`)
      .expect(409)
    expect(genReceivable.body.message).toBe('发团已结清，不可生成应收')

    const genPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${extraResource.body.data.id}/generate-payable`)
      .expect(409)
    expect(genPayable.body.message).toBe('发团已结清，不可生成应付')

    const manualReceivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-手工应收`,
        amountCents: 10_000,
        dueDate: '2026-09-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(409)
    expect(manualReceivable.body.message).toBe('发团已结清，不可创建收付款节点')

    const manualPayable = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-手工应付`,
        amountCents: 10_000,
        dueDate: '2026-09-01',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(409)
    expect(manualPayable.body.message).toBe('发团已结清，不可创建收付款节点')

    const stillSettled = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(stillSettled.body.data.status).toBe(DepartureStatus.settled)
  })

  it('C5: archived Departure rejects finance writes until unarchive', async () => {
    const departure = await createDeparture('c5-archive-gate')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 50_000,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.receivableScheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '归档前先关闭应收，供重开门禁',
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 30_000,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)
    const payableVerificationId = await firstVerificationId(schedules.payableScheduleNo)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${payableVerificationId}/cancel`)
      .send({ cancelReason: '归档前撤应付核销，保留财务履历以便测调价门禁' })
      .expect(201)

    const extraSource = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 40_000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .send({ reason: '归档门禁探针' })
      .expect(201)

    const cases: Array<{
      name: string
      run: () => Promise<{ status: number; body: { message?: string } }>
      expectedMessage: string
    }> = [
      {
        name: 'cancel verification',
        expectedMessage: '发团已关闭，不可撤销核销',
        run: async () => {
          const verificationId = await firstVerificationId(schedules.receivableScheduleNo)
          return authRequest(app, financeToken)
            .post(`/api/finance/verifications/${verificationId}/cancel`)
            .send({ cancelReason: '归档期不应撤销' })
        },
      },
      {
        name: 'close schedule',
        expectedMessage: '发团已关闭，不可关闭收付款节点',
        run: () =>
          authRequest(app, financeToken)
            .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/cancel`)
            .send({ closeDisposition: 'other', cancelReason: '归档期不应关闭' }),
      },
      {
        name: 'reopen schedule',
        expectedMessage: '发团已关闭，不可重新打开收付款节点，请先解除归档',
        run: () =>
          authRequest(app, financeToken)
            .post(`/api/finance/payment-schedules/${schedules.receivableScheduleId}/reopen`)
            .send({ reopenReason: '归档期不应重开' }),
      },
      {
        name: 'adjust amount',
        expectedMessage: '发团已关闭，不可调整约定金额',
        run: () =>
          authRequest(app, financeToken)
            .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/adjust-amount`)
            .send({ amountCents: 85_000, adjustReason: '归档期不应调价' }),
      },
      {
        name: 'generate receivable',
        expectedMessage: '发团已关闭，不可生成应收',
        run: () =>
          authRequest(app, coordinatorToken).post(
            `/api/source-orders/${extraSource.body.data.id}/generate-receivables`,
          ),
      },
    ]

    for (const testCase of cases) {
      const response = await testCase.run()
      expect({
        name: testCase.name,
        status: response.status,
        message: response.body.message,
      }).toEqual({
        name: testCase.name,
        status: 409,
        message: testCase.expectedMessage,
      })
    }

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/unarchive`)
      .send({ reason: '解除归档后恢复财务写入' })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '解档后可关闭未结清应付' })
      .expect(201)
  })
})
