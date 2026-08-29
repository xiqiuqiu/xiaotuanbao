import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureRouteSource,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import {
  PaymentChannel,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
} from '@xiaotuanbao/shared'
import {
  authRequest,
  AR_AP_SCHEDULE_NO_REGEX,
  CL_NO_REGEX,
  createTestApp,
  loginAs,
  TX_NO_REGEX,
} from './helpers'

/**
 * Cross-module finance journeys.
 * Seam: HTTP APIs across departure / source-order / segment-resource /
 * route-template / finance.
 * Asserts observable handoffs across full business closed loops.
 */
describe('Finance journeys (cross-module e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-fin-jny-${Date.now()}`

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

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-supplier`,
        categories: [ResourceKind.transport, ResourceKind.outsource],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { name: { startsWith: testPrefix } },
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
        paymentSchedule: {
          departure: { name: { startsWith: testPrefix } },
        },
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
    await prisma.routeTemplateResource.deleteMany({
      where: {
        templateSegment: {
          template: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.routeTemplateSegment.deleteMany({
      where: {
        template: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.routeTemplate.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
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
        routeName: '跨模块路线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    return response.body.data as { id: string; departureNo: string }
  }

  async function seedOps(departureId: string) {
    await prisma.itinerarySegment.deleteMany({ where: { departureId } })
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
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
        supplierId,
        title: '用车',
        amountCents: 360000,
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

  it('runs confirm-settlement lifecycle from ops generate to settled status', async () => {
    const departure = await createDeparture('confirm-lifecycle')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    const deptReceivables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(deptReceivables.body.data.total).toBe(1)
    expect(deptReceivables.body.data.items[0].id).toBe(schedules.receivableScheduleId)
    expect(deptReceivables.body.data.items[0].scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)

    const deptPayables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/payables`)
      .expect(200)
    expect(deptPayables.body.data.total).toBe(1)
    expect(deptPayables.body.data.items[0].id).toBe(schedules.payableScheduleId)

    const globalReceivable = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .expect(200)
    expect(globalReceivable.body.data.departureId).toBe(departure.id)
    expect(globalReceivable.body.data.unsettledAmountCents).toBe(1000000)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 360000,
        transactionDate: '2026-08-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const afterSettle = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)

    expect(afterSettle.body.data).toMatchObject({
      isFinanciallySettled: true,
      verifiedReceivableCents: 1000000,
      openUnsettledReceivableCents: 0,
      verifiedPayableCents: 360000,
      openUnsettledPayableCents: 0,
      completionTags: {
        receivables: '已收齐',
        payables: '已付清',
      },
    })

    const deptVerifications = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/verifications`)
      .expect(200)
    expect(deptVerifications.body.data.total).toBe(2)
    for (const item of deptVerifications.body.data.items) {
      expect(item.verificationNo).toMatch(CL_NO_REGEX)
    }

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const settled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)

    expect(settled.body.data.status).toBe(DepartureStatus.settled)
  })

  it('matches existing transactions then restores read model after cancel verification', async () => {
    const departure = await createDeparture('match-cancel')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    const inflow = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.WECHAT,
        amountCents: 1000000,
        transactionDate: '2026-08-03',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
      })
      .expect(201)
    expect(inflow.body.data.transactionNo).toMatch(TX_NO_REGEX)

    const outflow = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'outflow',
        paymentChannel: PaymentChannel.ALIPAY,
        amountCents: 360000,
        transactionDate: '2026-08-03',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
        departureId: departure.id,
      })
      .expect(201)

    const arLinked = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/link-transaction`)
      .send({
        transactionId: inflow.body.data.id,
        amountCents: 1000000,
      })
      .expect(201)
    expect(arLinked.body.data.status).toBe(PaymentScheduleStatus.SETTLED)
    expect(arLinked.body.data.settledAmountCents).toBe(1000000)

    const apLinked = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/link-transaction`)
      .send({
        transactionId: outflow.body.data.id,
        amountCents: 360000,
      })
      .expect(201)
    expect(apLinked.body.data.status).toBe(PaymentScheduleStatus.SETTLED)

    const arVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedules.receivableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(arVerifications.body.data.items).toHaveLength(1)
    expect(arVerifications.body.data.items[0].verificationNo).toMatch(CL_NO_REGEX)

    const apVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedules.payableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(apVerifications.body.data.items).toHaveLength(1)

    const settledDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(settledDetail.body.data.isFinanciallySettled).toBe(true)
    expect(settledDetail.body.data.verifiedReceivableCents).toBe(1000000)
    expect(settledDetail.body.data.verifiedPayableCents).toBe(360000)

    const cancelAr = await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${arVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '录入错误，撤销应收核销' })
      .expect(201)
    expect(cancelAr.body.data.cancelReason).toBe('录入错误，撤销应收核销')

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${apVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '录入错误，撤销应付核销' })
      .expect(201)

    const restoredReceivable = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .expect(200)
    expect(restoredReceivable.body.data.status).toBe(PaymentScheduleStatus.PENDING)
    expect(restoredReceivable.body.data.settledAmountCents).toBe(0)
    expect(restoredReceivable.body.data.unsettledAmountCents).toBe(1000000)

    const restoredPayable = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(restoredPayable.body.data.status).toBe(PaymentScheduleStatus.PENDING)
    expect(restoredPayable.body.data.settledAmountCents).toBe(0)

    const restoredDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(restoredDetail.body.data).toMatchObject({
      isFinanciallySettled: false,
      verifiedReceivableCents: 0,
      openUnsettledReceivableCents: 1000000,
      verifiedPayableCents: 0,
      openUnsettledPayableCents: 360000,
      unverifiedIncomeCents: 1000000,
      unverifiedExpenseCents: 360000,
      completionTags: {
        receivables: '应收已提交',
        payables: '应付已提交',
      },
    })

    const txDetail = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${inflow.body.data.id}`)
      .expect(200)
    expect(txDetail.body.data.allocatedAmountCents).toBe(0)
    expect(txDetail.body.data.unallocatedAmountCents).toBe(1000000)
  })

  it('revokes 10000/4000 verification while keeping finance history on original AP/AR nodes (#87)', async () => {
    const obligationCents = 1_000_000
    const verifiedCents = 400_000

    const departure = await createDeparture('revoke-history')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '撤销履历段',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        destination: '喀纳斯',
      })
      .expect(201)

    const resource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '用车-10000',
        amountCents: obligationCents,
      })
      .expect(201)

    const receivableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const payableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.body.data.id}/generate-payable`)
      .expect(201)

    const receivableScheduleId = receivableGenerated.body.data.schedules[0].id as string
    const receivableScheduleNo = receivableGenerated.body.data.schedules[0].scheduleNo as string
    const payableScheduleId = payableGenerated.body.data.schedule.id as string
    const payableScheduleNo = payableGenerated.body.data.schedule.scheduleNo as string

    const apPayment = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)
    expect(apPayment.body.data).toMatchObject({
      amountCents: obligationCents,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      financeTouched: true,
      status: PaymentScheduleStatus.PENDING,
    })

    const arCollection = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.WECHAT,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)
    expect(arCollection.body.data).toMatchObject({
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      financeTouched: true,
    })

    const resourceAfterPartial = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.body.data.id}`)
      .expect(200)
    expect(resourceAfterPartial.body.data).toMatchObject({
      hasPaymentSchedule: true,
      payableStatus: 'partial',
      amountFieldsLocked: true,
    })

    const sourceAfterPartial = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.body.data.id}`)
      .expect(200)
    expect(sourceAfterPartial.body.data).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'partial',
      amountFieldsLocked: true,
    })

    const apVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: payableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(apVerifications.body.data.items).toHaveLength(1)

    const arVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: receivableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(arVerifications.body.data.items).toHaveLength(1)

    const apTxId = apVerifications.body.data.items[0].transactionId as string
    const arTxId = arVerifications.body.data.items[0].transactionId as string

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${apVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '应付核销录入错误' })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${arVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '应收核销录入错误' })
      .expect(201)

    const restoredPayable = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${payableScheduleId}`)
      .expect(200)
    expect(restoredPayable.body.data).toMatchObject({
      id: payableScheduleId,
      amountCents: obligationCents,
      settledAmountCents: 0,
      unsettledAmountCents: obligationCents,
      status: PaymentScheduleStatus.PENDING,
      financeTouched: true,
    })

    const restoredReceivable = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${receivableScheduleId}`)
      .expect(200)
    expect(restoredReceivable.body.data).toMatchObject({
      id: receivableScheduleId,
      settledAmountCents: 0,
      unsettledAmountCents: obligationCents,
      status: PaymentScheduleStatus.PENDING,
      financeTouched: true,
    })

    const apTx = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${apTxId}`)
      .expect(200)
    expect(apTx.body.data).toMatchObject({
      amountCents: verifiedCents,
      allocatedAmountCents: 0,
      unallocatedAmountCents: verifiedCents,
      voidedAt: null,
    })

    const arTx = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${arTxId}`)
      .expect(200)
    expect(arTx.body.data).toMatchObject({
      amountCents: verifiedCents,
      allocatedAmountCents: 0,
      unallocatedAmountCents: verifiedCents,
      voidedAt: null,
    })

    const departureSummaryAfterRevoke = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(departureSummaryAfterRevoke.body.data).toMatchObject({
      verifiedReceivableCents: 0,
      openUnsettledReceivableCents: obligationCents,
      verifiedPayableCents: 0,
      openUnsettledPayableCents: obligationCents,
      unverifiedIncomeCents: verifiedCents,
      unverifiedExpenseCents: verifiedCents,
      isFinanciallySettled: false,
    })

    const resourceAfterRevoke = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.body.data.id}`)
      .expect(200)
    expect(resourceAfterRevoke.body.data).toMatchObject({
      hasPaymentSchedule: true,
      payableStatus: 'pending',
      amountFieldsLocked: true,
    })
    expect(resourceAfterRevoke.body.data.payableStatus).not.toBe('not_generated')

    const sourceAfterRevoke = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.body.data.id}`)
      .expect(200)
    expect(sourceAfterRevoke.body.data).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'pending',
      amountFieldsLocked: true,
    })
    expect(sourceAfterRevoke.body.data.receivableStatus).not.toBe('not_generated')

    const blockedPayableAmount = await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${payableScheduleId}`)
      .send({ amountCents: 900_000 })
      .expect(400)
    expect(blockedPayableAmount.body.message).toBe('财务已介入的节点不可修改金额')

    const blockedPayableDueDate = await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${payableScheduleId}`)
      .send({ dueDate: '2026-09-01' })
      .expect(400)
    expect(blockedPayableDueDate.body.message).toBe('财务已介入的节点不可修改到期日')

    const blockedPayableCounterparty = await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${payableScheduleId}`)
      .send({
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-partner`,
      })
      .expect(400)
    expect(blockedPayableCounterparty.body.message).toMatch(/财务已介入的节点不可修改往来/)

    const blockedReceivableAmount = await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${receivableScheduleId}`)
      .send({ amountCents: 900_000 })
      .expect(400)
    expect(blockedReceivableAmount.body.message).toBe('财务已介入的节点不可修改金额')

    // 「查看核销」入口只看有效已核销：履历仍为真，但 settled=0 时入口应隐藏
    expect(restoredPayable.body.data.financeTouched).toBe(true)
    expect(restoredPayable.body.data.settledAmountCents).toBe(0)
    expect(restoredReceivable.body.data.financeTouched).toBe(true)
    expect(restoredReceivable.body.data.settledAmountCents).toBe(0)

    const blockedResourceAmount = await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resource.body.data.id}`)
      .send({ amountCents: 900_000 })
      .expect(400)
    expect(blockedResourceAmount.body.message).toBe('当前资源已发生付款，不允许修改金额')

    const blockedSourceAmount = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.body.data.id}`)
      .send({ adultUnitPriceCents: 900_000 })
      .expect(400)
    expect(blockedSourceAmount.body.message).toBe('当前客源单已发生收款，不允许修改金额')

    const regeneratePayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.body.data.id}/generate-payable`)
      .expect(409)
    expect(regeneratePayable.body.message).toBe('当前资源已提交应付，不能再次提交')

    const regenerateReceivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(409)
    expect(regenerateReceivable.body.message).toBe('当前客源单已提交应收，不能再次提交')

    const cancelledHistory = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: payableScheduleNo,
        scheduleNoMatch: 'exact',
        status: 'cancelled',
        pageSize: 10,
      })
      .expect(200)
    expect(cancelledHistory.body.data.items).toHaveLength(1)
    expect(cancelledHistory.body.data.items[0].status).toBe('cancelled')

    const activeVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: payableScheduleNo,
        scheduleNoMatch: 'exact',
        status: 'normal',
        pageSize: 10,
      })
      .expect(200)
    expect(activeVerifications.body.data.items).toHaveLength(0)

    const repay = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.ALIPAY,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)
    expect(repay.body.data).toMatchObject({
      id: payableScheduleId,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      financeTouched: true,
    })

    const rematch = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivableScheduleId}/link-transaction`)
      .send({
        transactionId: arTxId,
        amountCents: verifiedCents,
      })
      .expect(201)
    expect(rematch.body.data).toMatchObject({
      id: receivableScheduleId,
      settledAmountCents: verifiedCents,
      financeTouched: true,
    })
  })

  it('settles guest deposit/balance receivables and keeps coordinator departure tabs in sync', async () => {
    const departure = await createDeparture('split-tabs')

    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        depositCents: 400000,
        balanceCents: 600000,
      })
      .expect(201)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)

    expect(generated.body.data.schedules).toHaveLength(2)

    const depositSchedule = generated.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
    )
    const balanceSchedule = generated.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    )
    expect(depositSchedule.amountCents).toBe(400000)
    expect(balanceSchedule.amountCents).toBe(600000)

    const tabsBefore = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(tabsBefore.body.data.total).toBe(2)
    expect(
      tabsBefore.body.data.items.every(
        (item: { direction: string }) => item.direction === PaymentScheduleDirection.receivable,
      ),
    ).toBe(true)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${depositSchedule.id}/confirm-collection`)
      .send({
        amountCents: 400000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrder.body.data.id,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${balanceSchedule.id}/confirm-collection`)
      .send({
        amountCents: 600000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrder.body.data.id,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    const tabsAfter = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(tabsAfter.body.data.items).toHaveLength(2)
    expect(
      tabsAfter.body.data.items.every(
        (item: { status: string }) => item.status === PaymentScheduleStatus.SETTLED,
      ),
    ).toBe(true)

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(detail.body.data.verifiedReceivableCents).toBe(1000000)
    expect(detail.body.data.openUnsettledReceivableCents).toBe(0)
    expect(detail.body.data.completionTags.receivables).toBe('已收齐')

    // ADR-0023: finance owns collection; a settled schedule still rejects further collection.
    const rejected = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${balanceSchedule.id}/confirm-collection`)
      .send({
        amountCents: 1,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.OTHER,
      })
      .expect(400)
    expect(rejected.body.message).toMatch(/结清|未结清|不可/)
  })

  it('builds departure from template then settles supplier and outsource payables', async () => {
    const template = await authRequest(app, coordinatorToken)
      .post('/api/route-templates')
      .send({
        name: `${testPrefix}-模板线`,
        defaultDayCount: 10,
        segments: [
          {
            sortOrder: 0,
            name: '喀纳斯',
            dayCount: 5,
            destination: '喀纳斯',
            resources: [
              {
                resourceKind: ResourceKind.transport,
                counterpartyType: CounterpartyType.supplier,
                supplierId,
                title: '用车',
                amountCents: 200000,
              },
              {
                resourceKind: ResourceKind.outsource,
                counterpartyType: CounterpartyType.supplier,
                supplierId,
                title: '拼出接待',
                amountCents: 150000,
              },
            ],
          },
        ],
      })
      .expect(201)

    const departure = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-模板团`,
        routeName: `${testPrefix}-模板线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        templateId: template.body.data.id,
      })
      .expect(201)

    expect(departure.body.data.routeSource).toBe(DepartureRouteSource.template)
    expect(departure.body.data.sourceTemplateId).toBe(template.body.data.id)

    const seededResources = await prisma.segmentResource.findMany({
      where: {
        segment: { departureId: departure.body.data.id },
      },
    })
    expect(seededResources).toHaveLength(2)
    expect(seededResources.every((resource) => resource.amountCents === 0)).toBe(true)

    for (const resource of seededResources) {
      const amountCents = resource.title === '用车' ? 200000 : 150000
      await prisma.segmentResource.update({
        where: { id: resource.id },
        data: { amountCents },
      })
    }

    const beforeFinance = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.body.data.id}`)
      .expect(200)
    expect(beforeFinance.body.data.completionTags.receivables).toBe('应收未提交')
    expect(beforeFinance.body.data.completionTags.payables).toBe('应付未提交')
    expect(beforeFinance.body.data.payableCents).toBe(350000)

    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 5,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)

    const resources = await prisma.segmentResource.findMany({
      where: {
        segment: { departureId: departure.body.data.id },
      },
      orderBy: { title: 'asc' },
    })
    expect(resources).toHaveLength(2)

    const receivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    expect(receivable.body.data.schedules).toHaveLength(1)
    expect(receivable.body.data.schedules[0].counterpartyType).toBe(CounterpartyType.partner)

    for (const resource of resources) {
      await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`)
        .expect(201)
    }

    const payablesTab = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.body.data.id}/payables`)
      .expect(200)
    expect(payablesTab.body.data.total).toBe(2)

    const supplierPayables = payablesTab.body.data.items.filter(
      (item: { counterpartyType: string }) =>
        item.counterpartyType === CounterpartyType.supplier,
    )
    expect(supplierPayables).toHaveLength(2)
    const transportPayable = supplierPayables.find(
      (item: { amountCents: number }) => item.amountCents === 200000,
    )
    const outsourcePayable = supplierPayables.find(
      (item: { amountCents: number }) => item.amountCents === 150000,
    )
    expect(transportPayable).toBeDefined()
    expect(outsourcePayable).toBeDefined()

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.schedules[0].id}/confirm-collection`)
      .send({
        amountCents: 500000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-partner`,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${transportPayable.id}/confirm-payment`)
      .send({
        amountCents: 200000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${outsourcePayable.id}/confirm-payment`)
      .send({
        amountCents: 150000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.WECHAT,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const settledDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.body.data.id}`)
      .expect(200)
    expect(settledDetail.body.data).toMatchObject({
      isFinanciallySettled: true,
      verifiedReceivableCents: 500000,
      verifiedPayableCents: 350000,
      openUnsettledPayableCents: 0,
      completionTags: {
        receivables: '已收齐',
        payables: '已付清',
      },
    })
  })

  it('tracks partial settlement then completes through confirm and match', async () => {
    const departure = await createDeparture('partial')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 400000,
        transactionDate: '2026-08-06',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 100000,
        transactionDate: '2026-08-06',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const partialDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(partialDetail.body.data).toMatchObject({
      isFinanciallySettled: false,
      verifiedReceivableCents: 400000,
      openUnsettledReceivableCents: 600000,
      verifiedPayableCents: 100000,
      openUnsettledPayableCents: 260000,
      completionTags: {
        receivables: '应收已提交',
        payables: '应付已提交',
      },
    })

    const rejectSettled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)
    expect(rejectSettled.body.data.status).toBe(DepartureStatus.pending_settlement)

    const stillOpen = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(400)
    expect(stillOpen.body.message).toBe('全部账款尚未结清，不可标记为已结清')

    const remainingInflow = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.WECHAT,
        amountCents: 600000,
        transactionDate: '2026-08-07',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/link-transaction`)
      .send({
        transactionId: remainingInflow.body.data.id,
        amountCents: 600000,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 260000,
        transactionDate: '2026-08-07',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const completeDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(completeDetail.body.data).toMatchObject({
      isFinanciallySettled: true,
      verifiedReceivableCents: 1000000,
      openUnsettledReceivableCents: 0,
      verifiedPayableCents: 360000,
      openUnsettledPayableCents: 0,
      completionTags: {
        receivables: '已收齐',
        payables: '已付清',
      },
    })

    const settled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
    expect(settled.body.data.status).toBe(DepartureStatus.settled)
  })

  it('voids unallocated transaction after cancel verification and rematches', async () => {
    const departure = await createDeparture('void-rematch')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    const inflow = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.ALIPAY,
        amountCents: 1000000,
        transactionDate: '2026-08-08',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/link-transaction`)
      .send({
        transactionId: inflow.body.data.id,
        amountCents: 1000000,
      })
      .expect(201)

    const blockedVoid = await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${inflow.body.data.id}/void`)
      .send({ voidReason: '录错金额' })
      .expect(400)
    expect(blockedVoid.body.message).toContain('核销')

    const verification = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedules.receivableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verification.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '准备作废流水' })
      .expect(201)

    const voided = await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${inflow.body.data.id}/void`)
      .send({ voidReason: '录错金额，作废重录' })
      .expect(201)
    expect(voided.body.data.voidReason).toBe('录错金额，作废重录')

    const relinkBlocked = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/link-transaction`)
      .send({
        transactionId: inflow.body.data.id,
        amountCents: 1000000,
      })
      .expect(400)
    expect(relinkBlocked.body.message).toContain('作废')

    const replacement = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        amountCents: 1000000,
        transactionDate: '2026-08-08',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications`)
      .send({
        paymentScheduleId: schedules.receivableScheduleId,
        transactionId: replacement.body.data.id,
        amountCents: 1000000,
        verificationDate: '2026-08-08',
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 360000,
        transactionDate: '2026-08-08',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(detail.body.data.isFinanciallySettled).toBe(true)
    expect(detail.body.data.verifiedReceivableCents).toBe(1000000)
    expect(detail.body.data.completionTags.receivables).toBe('已收齐')
  })

  it('reaches financially settled by voiding an untouched payable schedule', async () => {
    const departure = await createDeparture('cancel-payable')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-08-09',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    const beforeCancel = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(beforeCancel.body.data.isFinanciallySettled).toBe(false)
    expect(beforeCancel.body.data.openUnsettledPayableCents).toBe(360000)

    const voided = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/void-resource-payable`)
      .send({ voidReason: '供应商改免费接待，原应付误生成' })
      .expect(201)
    expect(voided.body.data.voidedAt).toBeTruthy()

    const afterCancel = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterCancel.body.data).toMatchObject({
      isFinanciallySettled: true,
      verifiedReceivableCents: 1000000,
      verifiedPayableCents: 0,
      openUnsettledPayableCents: 0,
      completionTags: {
        receivables: '已收齐',
        payables: '应付未提交',
      },
    })

    const voidedPayable = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(voidedPayable.body.data).toMatchObject({
      voidReason: '供应商改免费接待，原应付误生成',
      voidedAmountCents: 360000,
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const settled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
    expect(settled.body.data.status).toBe(DepartureStatus.settled)
  })

  /**
   * #89 structured close + payment schedule activity timeline.
   * Seam: HTTP APIs across finance schedules / verifications / detail read.
   * Locks close eligibility, disposition+note, close snapshot, and revoke-while-closed activity.
   */
  it('closes unsettled schedules with disposition snapshot and records revoke activity (#89)', async () => {
    const obligationCents = 1_000_000
    const verifiedCents = 400_000

    const departure = await createDeparture('structured-close')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '结构化关闭段',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        destination: '喀纳斯',
      })
      .expect(201)

    const resource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '关闭快照用车-10000',
        amountCents: obligationCents,
      })
      .expect(201)

    const payableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.body.data.id}/generate-payable`)
      .expect(201)
    const payableScheduleId = payableGenerated.body.data.schedule.id as string

    const receivableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const receivableScheduleId = receivableGenerated.body.data.schedules[0].id as string

    const partialPayment = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)
    expect(partialPayment.body.data).toMatchObject({
      amountCents: obligationCents,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      status: PaymentScheduleStatus.PENDING,
    })

    const txCountBeforeClose = await prisma.financeTransaction.count({
      where: {
        organizationId,
        departureId: departure.id,
      },
    })
    const verificationCountBeforeClose = await prisma.financeVerification.count({
      where: {
        organizationId,
        paymentScheduleId: payableScheduleId,
      },
    })

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({ cancelReason: '缺少处置类型' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({ closeDisposition: 'external_or_special' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'external_or_special',
        cancelReason: '   ',
      })
      .expect(400)

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'business_dispute_stop',
        cancelReason: '供应商争议，停止本团追付',
      })
      .expect(201)

    expect(closed.body.data).toMatchObject({
      id: payableScheduleId,
      amountCents: obligationCents,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      status: PaymentScheduleStatus.CANCELLED,
      closeDisposition: 'business_dispute_stop',
      cancelReason: '供应商争议，停止本团追付',
    })
    expect(closed.body.data.cancelledAt).toBeTruthy()
    expect(closed.body.data.cancelledBy).toBeTruthy()

    const txCountAfterClose = await prisma.financeTransaction.count({
      where: {
        organizationId,
        departureId: departure.id,
      },
    })
    const verificationCountAfterClose = await prisma.financeVerification.count({
      where: {
        organizationId,
        paymentScheduleId: payableScheduleId,
      },
    })
    expect(txCountAfterClose).toBe(txCountBeforeClose)
    expect(verificationCountAfterClose).toBe(verificationCountBeforeClose)

    const closedDetail = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${payableScheduleId}`)
      .expect(200)
    expect(closedDetail.body.data.activities).toEqual([
      expect.objectContaining({
        activityType: 'close',
        closeDisposition: 'business_dispute_stop',
        note: '供应商争议，停止本团追付',
        amountCents: obligationCents,
        settledAmountCents: verifiedCents,
        unsettledAmountCents: obligationCents - verifiedCents,
        operatedByName: expect.any(String),
      }),
    ])

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '重复关闭应拒绝',
      })
      .expect(400)

    const zeroVerifiedClose = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${receivableScheduleId}/cancel`)
      .send({
        closeDisposition: 'external_or_special',
        cancelReason: '客源改走外部专项收款',
      })
      .expect(201)
    expect(zeroVerifiedClose.body.data).toMatchObject({
      settledAmountCents: 0,
      unsettledAmountCents: obligationCents,
      status: PaymentScheduleStatus.CANCELLED,
      closeDisposition: 'external_or_special',
    })

    const settledReceivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: '已结清不可关闭',
        amountCents: 100_000,
        dueDate: '2026-08-20',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${settledReceivable.body.data.id}/confirm-collection`)
      .send({
        amountCents: 100_000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${settledReceivable.body.data.id}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '已结清不应关闭',
      })
      .expect(400)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: closed.body.data.scheduleNo,
        scheduleNoMatch: 'exact',
        status: 'normal',
        pageSize: 10,
      })
      .expect(200)
    expect(verifications.body.data.items).toHaveLength(1)

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '关闭后撤销部分核销' })
      .expect(201)

    const afterRevoke = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${payableScheduleId}`)
      .expect(200)
    expect(afterRevoke.body.data).toMatchObject({
      amountCents: obligationCents,
      settledAmountCents: 0,
      unsettledAmountCents: obligationCents,
      status: PaymentScheduleStatus.CANCELLED,
      closeDisposition: 'business_dispute_stop',
    })
    expect(afterRevoke.body.data.activities).toEqual([
      expect.objectContaining({
        activityType: 'close',
        closeDisposition: 'business_dispute_stop',
        amountCents: obligationCents,
        settledAmountCents: verifiedCents,
        unsettledAmountCents: obligationCents - verifiedCents,
      }),
      expect.objectContaining({
        activityType: 'verification_cancelled',
        note: '关闭后撤销部分核销',
        previousSettledAmountCents: verifiedCents,
        previousUnsettledAmountCents: obligationCents - verifiedCents,
        settledAmountCents: 0,
        unsettledAmountCents: obligationCents,
      }),
    ])
  })

  /**
   * #86 archive read-only gate matrix.
   * Seam: HTTP write APIs across departure ops + finance.
   * Covers archive reject × unarchive restore with consistent 409 semantics.
   */
  it('rejects ops and finance writes while archived, then restores after unarchive', async () => {
    const departure = await createDeparture('archive-gate')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    const linkedTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        amountCents: 10000,
        transactionDate: '2026-08-11',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
        notes: '归档前门禁探针流水',
      })
      .expect(201)

    const verification = await authRequest(app, financeToken)
      .post('/api/finance/verifications')
      .send({
        paymentScheduleId: schedules.receivableScheduleId,
        transactionId: linkedTx.body.data.id,
        amountCents: 10000,
        verificationDate: '2026-08-11',
      })
      .expect(201)

    const unallocatedLinkedTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'outflow',
        paymentChannel: PaymentChannel.CASH,
        amountCents: 500,
        transactionDate: '2026-08-11',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
        departureId: departure.id,
        notes: '归档前未核销关联流水',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .send({ reason: '归档只读门禁测试' })
      .expect(201)

    const expectArchivedConflict = async (
      request: Promise<{ status: number; body: { message?: string } }>,
      action: string,
    ) => {
      const response = await request
      expect(response.status).toBe(409)
      expect(response.body.message).toBe(`发团已关闭，不可${action}`)
    }

    await expectArchivedConflict(
      authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ name: `${testPrefix}-不应改` }),
      '编辑',
    )
    await expectArchivedConflict(
      authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId,
          adultGuestCount: 1,
          childGuestCount: 0,
          adultUnitPriceCents: 10000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        }),
      '编辑',
    )
    await expectArchivedConflict(
      authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({
          name: '不应新增段',
          startDate: '2026-08-01',
          endDate: '2026-08-02',
          destination: '测试',
        }),
      '编辑',
    )
    await expectArchivedConflict(
      authRequest(app, coordinatorToken).post(
        `/api/source-orders/${ops.sourceOrderId}/generate-receivables`,
      ),
      '提交应收',
    )
    await expectArchivedConflict(
      authRequest(app, coordinatorToken).post(
        `/api/segment-resources/${ops.resourceId}/generate-payable`,
      ),
      '提交应付',
    )

    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post('/api/finance/receivables')
        .send({
          departureId: departure.id,
          title: '归档期不应创建',
          amountCents: 1000,
          dueDate: '2026-08-20',
          counterpartyType: CounterpartyType.guest,
          counterpartyName: ops.displayName,
        }),
      '创建收付款节点',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .patch(`/api/finance/receivables/${schedules.receivableScheduleId}`)
        .send({ title: '归档期不应编辑' }),
      '编辑收付款节点',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/cancel`)
        .send({
          closeDisposition: 'other',
          cancelReason: '归档期不应关闭',
        }),
      '关闭收付款节点',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
        .send({
          amountCents: 1000,
          transactionDate: '2026-08-12',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.guest,
          counterpartyName: ops.displayName,
        }),
      '确认收款',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
        .send({
          amountCents: 1000,
          transactionDate: '2026-08-12',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
          counterpartyName: `${testPrefix}-supplier`,
        }),
      '确认付款',
    )

    const orphanDeparture = await createDeparture('orphan-tx-host')
    // 发团硬筛：伙伴须有本团源事实，否则无法建流水。
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${orphanDeparture.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 1000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)
    const orphanTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.CASH,
        amountCents: 1000,
        transactionDate: '2026-08-12',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: '其他发团流水可建',
        departureId: orphanDeparture.id,
      })
      .expect(201)

    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/receivables/${schedules.receivableScheduleId}/link-transaction`)
        .send({ transactionId: orphanTx.body.data.id, amountCents: 1000 }),
      '关联流水',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post('/api/finance/verifications')
        .send({
          paymentScheduleId: schedules.receivableScheduleId,
          transactionId: orphanTx.body.data.id,
          amountCents: 1000,
          verificationDate: '2026-08-12',
        }),
      '创建核销',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/verifications/${verification.body.data.id}/cancel`)
        .send({ cancelReason: '归档期不应撤销' }),
      '撤销核销',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post('/api/finance/transactions')
        .send({
          direction: 'inflow',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          amountCents: 2000,
          transactionDate: '2026-08-12',
          counterpartyType: CounterpartyType.guest,
        counterpartyId: ops.sourceOrderId,
        counterpartyName: ops.displayName,
        departureId: departure.id,
        }),
      '创建流水',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .put(`/api/finance/transactions/${unallocatedLinkedTx.body.data.id}`)
        .send({
          direction: 'outflow',
          paymentChannel: PaymentChannel.CASH,
          amountCents: 500,
          transactionDate: '2026-08-11',
          counterpartyType: CounterpartyType.supplier,
          counterpartyId: supplierId,
          counterpartyName: `${testPrefix}-supplier`,
          departureId: departure.id,
          notes: '归档期不应编辑',
        }),
      '编辑流水',
    )
    await expectArchivedConflict(
      authRequest(app, financeToken)
        .post(`/api/finance/transactions/${unallocatedLinkedTx.body.data.id}/void`)
        .send({ voidReason: '归档期不应作废' }),
      '作废流水',
    )

    await authRequest(app, coordinatorToken).get(`/api/departures/${departure.id}`).expect(200)
    await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/unarchive`)
      .send({ reason: '继续处理财务' })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({ name: `${testPrefix}-archive-gate-restored` })
      .expect(200)

    await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .send({ title: '解档后可编辑节点' })
      .expect(200)

    await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: '解档后可创建节点',
        amountCents: 1000,
        dueDate: '2026-08-20',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 5000,
        transactionDate: '2026-08-13',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verification.body.data.id}/cancel`)
      .send({ cancelReason: '解档后撤销探针核销' })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${linkedTx.body.data.id}/void`)
      .send({ voidReason: '解档后作废探针流水' })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${unallocatedLinkedTx.body.data.id}/void`)
      .send({ voidReason: '解档后作废未核销关联流水' })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/void-resource-payable`)
      .send({ voidReason: '解档后可作废未介入应付' })
      .expect(201)
  })

  it('copies departure without finance then regenerates and settles independently', async () => {
    const source = await createDeparture('copy-src')
    const ops = await seedOps(source.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-08-10',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    const copied = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${source.id}/copy`)
      .send({
        name: `${testPrefix}-copy-dst`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(201)

    expect(copied.body.data.routeSource).toBe(DepartureRouteSource.copy)

    const copiedDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copied.body.data.id}`)
      .expect(200)
    expect(copiedDetail.body.data).toMatchObject({
      sourceOrderCount: 0,
      // Copied 5-day segment + fill_missing for Sep 6–10.
      segmentCount: 6,
      resourceCount: 1,
      verifiedReceivableCents: 0,
      verifiedPayableCents: 0,
      completionTags: {
        receivables: '应收未提交',
        payables: '应付未提交',
      },
    })

    const scheduleCount = await prisma.paymentSchedule.count({
      where: { departureId: copied.body.data.id },
    })
    expect(scheduleCount).toBe(0)

    const newSourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${copied.body.data.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 4,
        childGuestCount: 0,
        adultUnitPriceCents: 80000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const resource = await prisma.segmentResource.findFirst({
      where: { segment: { departureId: copied.body.data.id } },
    })
    if (!resource) {
      throw new Error('Copied resource not found')
    }
    expect(resource.amountCents).toBe(0)
    expect(resource.supplierId).toBeNull()

    const copiedResourceAmountCents = 88000
    await prisma.segmentResource.update({
      where: { id: resource.id },
      data: { amountCents: copiedResourceAmountCents, supplierId },
    })

    const receivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${newSourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const payable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.schedules[0].id}/confirm-collection`)
      .send({
        amountCents: 320000,
        transactionDate: '2026-09-02',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: newSourceOrder.body.data.id,
        counterpartyName: newSourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${payable.body.data.schedule.id}/confirm-payment`)
      .send({
        amountCents: copiedResourceAmountCents,
        transactionDate: '2026-09-02',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const settledCopy = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copied.body.data.id}`)
      .expect(200)
    expect(settledCopy.body.data.isFinanciallySettled).toBe(true)
    expect(settledCopy.body.data.verifiedReceivableCents).toBe(320000)

    const sourceStillSettled = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .expect(200)
    expect(sourceStillSettled.body.data.status).toBe(PaymentScheduleStatus.SETTLED)
    expect(sourceStillSettled.body.data.departureId).toBe(source.id)
  })

  it('keeps source finance-touched amounts and flags mismatch without mutating schedule', async () => {
    const departure = await createDeparture('mismatch')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 300000,
        transactionDate: '2026-08-11',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${ops.sourceOrderId}`)
      .send({ adultUnitPriceCents: 90000 })
      .expect(400)
    expect(blocked.body.message).toBe('当前客源单已发生收款，不允许修改金额')

    await prisma.sourceOrder.update({
      where: { id: ops.sourceOrderId },
      data: {
        adultUnitPriceCents: 90000,
        grossReceivableCents: 900000,
        netReceivableCents: 900000,
        // guest_only 默认落尾款路径；mismatch 比的是路径约定而非仅 guestCollect 合计。
        depositCents: 0,
        balanceCents: 900000,
        guestCollectCents: 900000,
      },
    })

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${ops.sourceOrderId}/generate-receivables`)
      .expect(409)
    expect(regenerated.body.message).toBe('当前客源单已提交应收，不能再次提交')

    const sourceOrder = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${ops.sourceOrderId}`)
      .expect(200)
    expect(sourceOrder.body.data.hasSourceAmountMismatch).toBe(true)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${schedules.receivableScheduleId}`)
      .expect(200)
    expect(schedule.body.data.amountCents).toBe(1000000)
    expect(schedule.body.data.settledAmountCents).toBe(300000)
    expect(schedule.body.data.unsettledAmountCents).toBe(700000)
    expect(schedule.body.data.financeTouched).toBe(true)

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(detail.body.data.verifiedReceivableCents).toBe(300000)
    expect(detail.body.data.openUnsettledReceivableCents).toBe(700000)
    expect(detail.body.data.isFinanciallySettled).toBe(false)
  })

  /**
   * #90 auditable reopen of closed payment schedules.
   * Seam: HTTP APIs across finance schedules / operations / departure archive.
   * Locks reopen eligibility, reason+progress snapshot, close history retention,
   * settlement restoration, payment entry recovery, and archive-first guidance.
   */
  it('reopens closed schedules with reason, keeps close history, and restores progress (#90)', async () => {
    const obligationCents = 800_000
    const verifiedCents = 300_000

    const departure = await createDeparture('auditable-reopen')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const receivableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const scheduleId = receivableGenerated.body.data.schedules[0].id as string
    const scheduleNo = receivableGenerated.body.data.schedules[0].scheduleNo as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({
        closeDisposition: 'business_dispute_stop',
        cancelReason: '临时停止追收，待商务确认',
      })
      .expect(201)
    expect(closed.body.data).toMatchObject({
      id: scheduleId,
      status: PaymentScheduleStatus.CANCELLED,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
    })

    const openSchedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: '未关闭不可重新打开',
        amountCents: 50_000,
        dueDate: '2026-08-20',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${openSchedule.body.data.id}/reopen`)
      .send({ reopenReason: '未关闭节点不应打开' })
      .expect(400)

    const scheduleCountBeforeReopen = await prisma.paymentSchedule.count({
      where: { organizationId, departureId: departure.id },
    })

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/reopen`)
      .send({})
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/reopen`)
      .send({ reopenReason: '   ' })
      .expect(400)

    const reopened = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/reopen`)
      .send({ reopenReason: '商务确认继续追收原节点' })
      .expect(201)

    expect(reopened.body.data).toMatchObject({
      id: scheduleId,
      scheduleNo,
      amountCents: obligationCents,
      settledAmountCents: verifiedCents,
      unsettledAmountCents: obligationCents - verifiedCents,
      status: PaymentScheduleStatus.PENDING,
      cancelledAt: null,
      cancelledBy: null,
      closeDisposition: null,
      cancelReason: null,
      financeTouched: true,
    })

    const scheduleCountAfterReopen = await prisma.paymentSchedule.count({
      where: { organizationId, departureId: departure.id },
    })
    expect(scheduleCountAfterReopen).toBe(scheduleCountBeforeReopen)

    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${scheduleId}`)
      .expect(200)
    expect(detail.body.data.activities).toEqual([
      expect.objectContaining({
        activityType: 'close',
        closeDisposition: 'business_dispute_stop',
        note: '临时停止追收，待商务确认',
        amountCents: obligationCents,
        settledAmountCents: verifiedCents,
        unsettledAmountCents: obligationCents - verifiedCents,
      }),
      expect.objectContaining({
        activityType: 'reopen',
        note: '商务确认继续追收原节点',
        amountCents: obligationCents,
        settledAmountCents: verifiedCents,
        unsettledAmountCents: obligationCents - verifiedCents,
        operatedByName: expect.any(String),
      }),
    ])

    await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${scheduleId}`)
      .send({ amountCents: obligationCents + 1 })
      .expect(400)

    const furtherCollection = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 100_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)
    expect(furtherCollection.body.data).toMatchObject({
      id: scheduleId,
      settledAmountCents: verifiedCents + 100_000,
      unsettledAmountCents: obligationCents - verifiedCents - 100_000,
      status: PaymentScheduleStatus.PENDING,
    })

    const matchTx = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        amountCents: 50_000,
        transactionDate: '2026-08-06',
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrder.body.data.id,
        counterpartyName: sourceOrder.body.data.displayName,
        departureId: departure.id,
        notes: '重新打开后匹配流水',
      })
      .expect(201)

    const matched = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/link-transaction`)
      .send({
        transactionId: matchTx.body.data.id,
        amountCents: 50_000,
      })
      .expect(201)
    expect(matched.body.data).toMatchObject({
      id: scheduleId,
      settledAmountCents: verifiedCents + 150_000,
      unsettledAmountCents: obligationCents - verifiedCents - 150_000,
    })

    const overdueSchedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: '逾期恢复探针',
        amountCents: 120_000,
        dueDate: '2026-06-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${overdueSchedule.body.data.id}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '先关闭再测逾期恢复',
      })
      .expect(201)

    const overdueReopened = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${overdueSchedule.body.data.id}/reopen`)
      .send({ reopenReason: '恢复逾期追收' })
      .expect(201)
    expect(overdueReopened.body.data).toMatchObject({
      id: overdueSchedule.body.data.id,
      settledAmountCents: 0,
      unsettledAmountCents: 120_000,
      status: PaymentScheduleStatus.OVERDUE,
      cancelledAt: null,
    })

    const archiveDeparture = await createDeparture('reopen-archive-gate')
    const archiveOps = await seedOps(archiveDeparture.id)
    const archiveSchedules = await generateSchedules(archiveOps)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${archiveSchedules.receivableScheduleId}/cancel`)
      .send({
        closeDisposition: 'external_or_special',
        cancelReason: '归档前关闭应收',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/close`)
      .send({ reason: '归档后拒绝直接重新打开' })
      .expect(201)

    const archivedReject = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${archiveSchedules.receivableScheduleId}/reopen`)
      .send({ reopenReason: '归档期不应直接打开' })
    expect(archivedReject.status).toBe(409)
    expect(archivedReject.body.message).toBe(
      '发团已关闭，不可重新打开收付款节点，请先解除归档',
    )

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/unarchive`)
      .send({ reason: '解除归档后再重新打开节点' })
      .expect(201)

    const afterUnarchive = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${archiveSchedules.receivableScheduleId}/reopen`)
      .send({ reopenReason: '解除归档后继续追收' })
      .expect(201)
    expect(afterUnarchive.body.data).toMatchObject({
      id: archiveSchedules.receivableScheduleId,
      status: PaymentScheduleStatus.PENDING,
      cancelledAt: null,
    })
  })

  /**
   * #91 reopen on settled departure reverses settlement atomically.
   * Seam: HTTP APIs across finance reopen / departure status / OP-visible history.
   * Locks confirm semantics, atomic reopen+rollback, permission, visible reversal,
   * and no auto re-settle after schedules end again.
   */
  it('reopens schedule on settled departure with confirm, rolls back settlement, and does not auto re-settle (#91)', async () => {
    const adminToken = await loginAs(app, 'mazong')
    const departure = await createDeparture('reopen-reverses-settlement')
    const ops = await seedOps(departure.id)
    const schedules = await generateSchedules(ops)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${schedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-08-09',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: ops.displayName,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 10000,
        transactionDate: '2026-08-09',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const closedPayable = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'external_or_special',
        cancelReason: '供应商改免费接待，关闭应付以达账款结束',
      })
      .expect(201)
    expect(closedPayable.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const settled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
    expect(settled.body.data.status).toBe(DepartureStatus.settled)

    const missingConfirm = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/reopen`)
      .send({ reopenReason: '未确认联动不应打开' })
    expect(missingConfirm.status).toBe(400)
    expect(missingConfirm.body.message).toMatch(/确认|待结算|已结清/)

    const falseConfirm = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/reopen`)
      .send({
        reopenReason: '显式拒绝联动',
        confirmDepartureSettlementReversal: false,
      })
    expect(falseConfirm.status).toBe(400)

    const stillSettled = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(stillSettled.body.data.status).toBe(DepartureStatus.settled)
    expect(stillSettled.body.data.isFinanciallySettled).toBe(true)

    const stillClosed = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(stillClosed.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

    const failureReason = 'e2e-force-settlement-history-failure'
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION e2e_fail_settlement_history_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.reason = '${failureReason}' THEN
          RAISE EXCEPTION 'forced settlement history insert failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS e2e_fail_settlement_history_insert ON departure_settlement_histories',
    )
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER e2e_fail_settlement_history_insert
      BEFORE INSERT ON departure_settlement_histories
      FOR EACH ROW EXECUTE FUNCTION e2e_fail_settlement_history_insert()
    `)
    try {
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/reopen`)
        .send({
          reopenReason: failureReason,
          confirmDepartureSettlementReversal: true,
        })
        .expect(500)
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS e2e_fail_settlement_history_insert ON departure_settlement_histories',
      )
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS e2e_fail_settlement_history_insert()',
      )
    }

    const afterInjectedFailure = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterInjectedFailure.body.data.status).toBe(DepartureStatus.settled)
    const scheduleAfterInjectedFailure = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(scheduleAfterInjectedFailure.body.data.status).toBe(
      PaymentScheduleStatus.CANCELLED,
    )

    const reopened = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/reopen`)
      .send({
        reopenReason: '供应商恢复收费，需继续追付并回退发团结清',
        confirmDepartureSettlementReversal: true,
      })
      .expect(201)

    expect(reopened.body.data).toMatchObject({
      id: schedules.payableScheduleId,
      status: PaymentScheduleStatus.PENDING,
      cancelledAt: null,
      departureStatus: DepartureStatus.pending_settlement,
    })

    const afterReopen = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterReopen.body.data).toMatchObject({
      status: DepartureStatus.pending_settlement,
      isFinanciallySettled: false,
    })
    expect(afterReopen.body.data.settlementHistory).toEqual([
      expect.objectContaining({
        triggerPaymentScheduleId: schedules.payableScheduleId,
        triggerScheduleNo: closedPayable.body.data.scheduleNo,
        reason: '供应商恢复收费，需继续追付并回退发团结清',
        operatedByName: expect.any(String),
        previousStatus: DepartureStatus.settled,
        newStatus: DepartureStatus.pending_settlement,
      }),
    ])

    const payableDetail = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(payableDetail.body.data.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: 'close',
          note: '供应商改免费接待，关闭应付以达账款结束',
        }),
        expect.objectContaining({
          activityType: 'reopen',
          note: '供应商恢复收费，需继续追付并回退发团结清',
        }),
      ]),
    )

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 350000,
        transactionDate: '2026-08-10',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const afterResettleSchedules = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterResettleSchedules.body.data).toMatchObject({
      status: DepartureStatus.pending_settlement,
      isFinanciallySettled: true,
    })

    const resettled = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
    expect(resettled.body.data.status).toBe(DepartureStatus.settled)

    const adminDeparture = await createDeparture('reopen-reverses-admin')
    const adminOps = await seedOps(adminDeparture.id)
    const adminSchedules = await generateSchedules(adminOps)

    await authRequest(app, adminToken)
      .post(`/api/finance/receivables/${adminSchedules.receivableScheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-08-09',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: adminOps.sourceOrderId,
        counterpartyName: adminOps.displayName,
      })
      .expect(201)

    await authRequest(app, adminToken)
      .post(`/api/finance/payables/${adminSchedules.payableScheduleId}/confirm-payment`)
      .send({
        amountCents: 10000,
        transactionDate: '2026-08-09',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    await authRequest(app, adminToken)
      .post(`/api/finance/payment-schedules/${adminSchedules.payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '管理员路径关闭应付',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${adminDeparture.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${adminDeparture.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)

    const adminReopened = await authRequest(app, adminToken)
      .post(`/api/finance/payment-schedules/${adminSchedules.payableScheduleId}/reopen`)
      .send({
        reopenReason: '企业管理员确认联动回退结清',
        confirmDepartureSettlementReversal: true,
      })
      .expect(201)
    expect(adminReopened.body.data).toMatchObject({
      id: adminSchedules.payableScheduleId,
      status: PaymentScheduleStatus.PENDING,
      departureStatus: DepartureStatus.pending_settlement,
    })

    const adminAfter = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${adminDeparture.id}`)
      .expect(200)
    expect(adminAfter.body.data.status).toBe(DepartureStatus.pending_settlement)
    expect(adminAfter.body.data.settlementHistory).toEqual([
      expect.objectContaining({
        triggerPaymentScheduleId: adminSchedules.payableScheduleId,
        reason: '企业管理员确认联动回退结清',
        operatedByName: expect.any(String),
      }),
    ])
  })

  /**
   * #92 explicit payable amount adjustment after finance history.
   * Seam: HTTP APIs across segment-resource / payable schedule / departure read model.
   * Locks success path, rejection matrix, atomic resource+schedule update,
   * activity timeline, and no regenerate / ordinary-edit bypass.
   */
  it('adjusts resource payable agreed amount with reason while keeping original node (#92)', async () => {
    const obligationCents = 1_000_000
    const verifiedCents = 400_000
    const adjustedCents = 900_000

    const departure = await createDeparture('explicit-payable-adjust')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '显式调整段',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        destination: '喀纳斯',
      })
      .expect(201)

    const resource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '用车-显式调整',
        amountCents: obligationCents,
      })
      .expect(201)
    const resourceId = resource.body.data.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)
    const payableGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resourceId}/generate-payable`)
      .expect(201)

    const payableScheduleId = payableGenerated.body.data.schedule.id as string
    const payableScheduleNo = payableGenerated.body.data.schedule.scheduleNo as string

    const payment = await authRequest(app, financeToken)
      .post(`/api/finance/payables/${payableScheduleId}/confirm-payment`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)
    expect(payment.body.data.settledAmountCents).toBe(verifiedCents)

    const withActiveVerification = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents, adjustReason: '仍有有效核销不应调整' })
    expect(withActiveVerification.status).toBe(400)
    expect(withActiveVerification.body.message).toBe(
      '仍有有效核销时不可调整约定金额，请先撤销相关核销',
    )

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: payableScheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(verifications.body.data.items).toHaveLength(1)
    const verificationId = verifications.body.data.items[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .send({ cancelReason: '撤销后准备显式调整约定金额' })
      .expect(201)

    const restored = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${payableScheduleId}`)
      .expect(200)
    expect(restored.body.data).toMatchObject({
      id: payableScheduleId,
      scheduleNo: payableScheduleNo,
      amountCents: obligationCents,
      settledAmountCents: 0,
      unsettledAmountCents: obligationCents,
      financeTouched: true,
      status: PaymentScheduleStatus.PENDING,
    })

    await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${payableScheduleId}`)
      .send({ amountCents: adjustedCents })
      .expect(400)

    await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resourceId}`)
      .send({ amountCents: adjustedCents })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ adjustReason: '缺少金额' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents, adjustReason: '   ' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ amountCents: 0, adjustReason: '金额必须大于零' })
      .expect(400)

    const scheduleCountBefore = await prisma.paymentSchedule.count({
      where: { organizationId, departureId: departure.id, direction: PaymentScheduleDirection.payable },
    })

    const adjusted = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({
        amountCents: adjustedCents,
        adjustReason: '供应商重新议价，修正约定金额',
      })
      .expect(201)

    expect(adjusted.body.data).toMatchObject({
      id: payableScheduleId,
      scheduleNo: payableScheduleNo,
      amountCents: adjustedCents,
      settledAmountCents: 0,
      unsettledAmountCents: adjustedCents,
      financeTouched: true,
      status: PaymentScheduleStatus.PENDING,
      amountAdjustedAt: expect.any(String),
    })

    const scheduleCountAfter = await prisma.paymentSchedule.count({
      where: { organizationId, departureId: departure.id, direction: PaymentScheduleDirection.payable },
    })
    expect(scheduleCountAfter).toBe(scheduleCountBefore)

    const resourceAfter = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resourceId}`)
      .expect(200)
    expect(resourceAfter.body.data).toMatchObject({
      amountCents: adjustedCents,
      hasPaymentSchedule: true,
      payableStatus: 'pending',
      amountFieldsLocked: true,
      hasSourceAmountMismatch: false,
    })

    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${payableScheduleId}`)
      .expect(200)
    expect(detail.body.data.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: 'amount_adjust',
          note: '供应商重新议价，修正约定金额',
          previousAmountCents: obligationCents,
          amountCents: adjustedCents,
          operatedByName: expect.any(String),
          operatedAt: expect.any(String),
        }),
      ]),
    )

    const historyAfterAdjust = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: payableScheduleNo,
        scheduleNoMatch: 'exact',
        status: 'cancelled',
        pageSize: 10,
      })
      .expect(200)
    expect(historyAfterAdjust.body.data.items).toHaveLength(1)
    expect(historyAfterAdjust.body.data.items[0].id).toBe(verificationId)

    const departureSummary = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(departureSummary.body.data).toMatchObject({
      openUnsettledPayableCents: adjustedCents,
      verifiedPayableCents: 0,
    })

    const regenerate = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resourceId}/generate-payable`)
      .expect(409)
    expect(regenerate.body.message).toBe('当前资源已提交应付，不能再次提交')

    await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${payableScheduleId}`)
      .send({ amountCents: 800_000 })
      .expect(400)

    await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resourceId}`)
      .send({ amountCents: 800_000 })
      .expect(400)

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '关闭后不可再调整',
      })
      .expect(201)
    expect(closed.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

    const closedReject = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${payableScheduleId}/adjust-amount`)
      .send({ amountCents: 850_000, adjustReason: '已关闭不应调整' })
    expect(closedReject.status).toBe(400)
    expect(closedReject.body.message).toBe('已关闭节点不可调整约定金额')

    const archiveDeparture = await createDeparture('adjust-archive-gate')
    const archiveSegment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/segments`)
      .send({
        name: '归档调整段',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        destination: '喀纳斯',
      })
      .expect(201)
    const archiveResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${archiveSegment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '归档用车',
        amountCents: 500_000,
      })
      .expect(201)
    const archivePayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${archiveResource.body.data.id}/generate-payable`)
      .expect(201)
    const archiveScheduleId = archivePayable.body.data.schedule.id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${archiveScheduleId}/confirm-payment`)
      .send({
        amountCents: 100_000,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const archiveVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: archivePayable.body.data.schedule.scheduleNo,
        scheduleNoMatch: 'exact',
        pageSize: 10,
      })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${archiveVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '归档前撤销核销' })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/close`)
      .send({ reason: '归档后拒绝显式调整' })
      .expect(201)

    const archivedReject = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${archiveScheduleId}/adjust-amount`)
      .send({ amountCents: 450_000, adjustReason: '归档期不应调整' })
    expect(archivedReject.status).toBe(409)
    expect(archivedReject.body.message).toBe('发团已关闭，不可调整约定金额')
  })

  /**
   * #93 explicit receivable amount adjustment after finance history.
   * Seam: HTTP APIs across source-order / receivable schedule / departure read model.
   * Locks guest-collection, customer-settlement, and split-path success + rejection
   * matrix; path-local source sync; activity timeline；调低 G 后可补全客户补款，齐全后再生成 409。
   */
  it('adjusts guest-collection receivable agreed amount with reason while keeping original node (#93)', async () => {
    const obligationCents = 1_000_000
    const verifiedCents = 400_000
    const adjustedCents = 900_000

    const departure = await createDeparture('explicit-recv-guest')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)
    const sourceOrderId = sourceOrder.body.data.id as string

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)
    expect(generated.body.data.schedules).toHaveLength(1)
    expect(generated.body.data.schedules[0].sourceType).toBe(
      PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    )

    const scheduleId = generated.body.data.schedules[0].id as string
    const scheduleNo = generated.body.data.schedules[0].scheduleNo as string

    const collection = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)
    expect(collection.body.data.settledAmountCents).toBe(verifiedCents)

    const withActiveVerification = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents, adjustReason: '仍有有效核销不应调整' })
    expect(withActiveVerification.status).toBe(400)
    expect(withActiveVerification.body.message).toBe(
      '仍有有效核销时不可调整约定金额，请先撤销相关核销',
    )

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    expect(verifications.body.data.items).toHaveLength(1)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '撤销后准备显式调整约定金额' })
      .expect(201)

    const restored = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${scheduleId}`)
      .expect(200)
    expect(restored.body.data).toMatchObject({
      id: scheduleId,
      amountCents: obligationCents,
      settledAmountCents: 0,
      financeTouched: true,
      status: PaymentScheduleStatus.PENDING,
    })

    await authRequest(app, financeToken)
      .patch(`/api/finance/receivables/${scheduleId}`)
      .send({ amountCents: adjustedCents })
      .expect(400)

    await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrderId}`)
      .send({ adultUnitPriceCents: adjustedCents })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ adjustReason: '缺少金额' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ amountCents: adjustedCents, adjustReason: '   ' })
      .expect(400)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ amountCents: 0, adjustReason: '金额必须大于零' })
      .expect(400)

    const scheduleCountBefore = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        departureId: departure.id,
        direction: PaymentScheduleDirection.receivable,
      },
    })

    const adjusted = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({
        amountCents: adjustedCents,
        adjustReason: '游客代收重新议价，修正约定金额',
      })
      .expect(201)

    expect(adjusted.body.data).toMatchObject({
      id: scheduleId,
      scheduleNo,
      amountCents: adjustedCents,
      settledAmountCents: 0,
      unsettledAmountCents: adjustedCents,
      financeTouched: true,
      status: PaymentScheduleStatus.PENDING,
      amountAdjustedAt: expect.any(String),
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    })

    const scheduleCountAfter = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        departureId: departure.id,
        direction: PaymentScheduleDirection.receivable,
      },
    })
    expect(scheduleCountAfter).toBe(scheduleCountBefore)

    const sourceAfter = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrderId}`)
      .expect(200)
    expect(sourceAfter.body.data).toMatchObject({
      depositCents: 0,
      balanceCents: adjustedCents,
      guestCollectCents: adjustedCents,
      partnerCollectedCents: 0,
      // 调整 Guest 路径不改写结算金额 S。
      netReceivableCents: obligationCents,
      receivableStatus: 'pending',
      amountFieldsLocked: true,
      hasSourceAmountMismatch: false,
    })

    const receivableList = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(receivableList.body.data.items).toHaveLength(1)
    expect(receivableList.body.data.items[0]).toMatchObject({
      id: scheduleId,
      amountCents: adjustedCents,
    })

    const detail = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${scheduleId}`)
      .expect(200)
    expect(detail.body.data.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: 'amount_adjust',
          note: '游客代收重新议价，修正约定金额',
          previousAmountCents: obligationCents,
          amountCents: adjustedCents,
          operatedByName: expect.any(String),
          operatedAt: expect.any(String),
        }),
      ]),
    )

    const departureSummary = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(departureSummary.body.data).toMatchObject({
      openUnsettledReceivableCents: adjustedCents,
      verifiedReceivableCents: 0,
    })

    // 调低 G约定 后 S−G约定>0，补全应收应补建客户补款；路径齐全后再生成则 409。
    const topUpGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)
    expect(topUpGenerated.body.data.schedules).toHaveLength(1)
    expect(topUpGenerated.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      title: '客户补款',
      amountCents: obligationCents - adjustedCents,
    })
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(409)

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '关闭后不可再调整',
      })
      .expect(201)
    expect(closed.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

    const closedReject = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({ amountCents: 850_000, adjustReason: '已关闭不应调整' })
    expect(closedReject.status).toBe(400)
    expect(closedReject.body.message).toBe('已关闭节点不可调整约定金额')

    const archiveDeparture = await createDeparture('recv-adjust-archive')
    const archiveSource = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 500_000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)
    const archiveGenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${archiveSource.body.data.id}/generate-receivables`)
      .expect(201)
    const archiveScheduleId = archiveGenerated.body.data.schedules[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${archiveScheduleId}/confirm-collection`)
      .send({
        amountCents: 100_000,
        transactionDate: '2026-08-03',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: archiveSource.body.data.id,
        counterpartyName: archiveSource.body.data.displayName,
      })
      .expect(201)

    const archiveVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: archiveGenerated.body.data.schedules[0].scheduleNo,
        scheduleNoMatch: 'exact',
        pageSize: 10,
      })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${archiveVerifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '归档前撤销核销' })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${archiveDeparture.id}/close`)
      .send({ reason: '归档后拒绝显式调整' })
      .expect(201)

    const archivedReject = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${archiveScheduleId}/adjust-amount`)
      .send({ amountCents: 450_000, adjustReason: '归档期不应调整' })
    expect(archivedReject.status).toBe(409)
    expect(archivedReject.body.message).toBe('发团已关闭，不可调整约定金额')
  })

  it('adjusts customer-settlement receivable and keeps partner path source in sync (#93)', async () => {
    const obligationCents = 800_000
    const verifiedCents = 200_000
    const adjustedCents = 750_000

    const departure = await createDeparture('explicit-recv-partner')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: obligationCents,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)
    const sourceOrderId = sourceOrder.body.data.id as string

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)
    expect(generated.body.data.schedules).toHaveLength(1)
    expect(generated.body.data.schedules[0].sourceType).toBe(
      PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    const scheduleId = generated.body.data.schedules[0].id as string
    const scheduleNo = generated.body.data.schedules[0].scheduleNo as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: verifiedCents,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-partner`,
      })
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo, scheduleNoMatch: 'exact', pageSize: 10 })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '撤销后调整客户补款' })
      .expect(201)

    const adjusted = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/adjust-amount`)
      .send({
        amountCents: adjustedCents,
        adjustReason: '客户补款重新议价',
      })
      .expect(201)

    expect(adjusted.body.data).toMatchObject({
      id: scheduleId,
      amountCents: adjustedCents,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      financeTouched: true,
    })

    const sourceAfter = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrderId}`)
      .expect(200)
    expect(sourceAfter.body.data).toMatchObject({
      partnerCollectedCents: adjustedCents,
      guestCollectCents: 0,
      netReceivableCents: adjustedCents,
      grossReceivableCents: adjustedCents,
      hasSourceAmountMismatch: false,
      receivableStatus: 'pending',
    })

    const listItem = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${scheduleId}`)
      .expect(200)
    expect(listItem.body.data.amountCents).toBe(adjustedCents)

    const departureReceivables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(departureReceivables.body.data.items[0].amountCents).toBe(adjustedCents)

    const departureSummary = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(departureSummary.body.data.openUnsettledReceivableCents).toBe(adjustedCents)
  })

  it('adjusts one guest deposit path without mutating the sibling balance path (#93)', async () => {
    const netCents = 1_000_000
    const depositPathCents = 400_000
    const balancePathCents = 600_000
    const adjustedDepositCents = 350_000

    const departure = await createDeparture('explicit-recv-split')
    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100_000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        depositCents: depositPathCents,
        balanceCents: balancePathCents,
      })
      .expect(201)
    const sourceOrderId = sourceOrder.body.data.id as string
    expect(sourceOrder.body.data).toMatchObject({
      partnerCollectedCents: 0,
      guestCollectCents: depositPathCents + balancePathCents,
      netReceivableCents: netCents,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)
    expect(generated.body.data.schedules).toHaveLength(2)

    const depositSchedule = generated.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
    )
    const balanceSchedule = generated.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    )
    expect(depositSchedule.amountCents).toBe(depositPathCents)
    expect(balanceSchedule.amountCents).toBe(balancePathCents)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${depositSchedule.id}/confirm-collection`)
      .send({
        amountCents: 100_000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrderId,
        counterpartyName: sourceOrder.body.data.displayName,
      })
      .expect(201)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({
        scheduleNo: depositSchedule.scheduleNo,
        scheduleNoMatch: 'exact',
        pageSize: 10,
      })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '撤销后仅调整定金代收路径' })
      .expect(201)

    const scheduleCountBefore = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        direction: PaymentScheduleDirection.receivable,
      },
    })

    const adjusted = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${depositSchedule.id}/adjust-amount`)
      .send({
        amountCents: adjustedDepositCents,
        adjustReason: '全代收下仅修正定金代收',
      })
      .expect(201)
    expect(adjusted.body.data).toMatchObject({
      id: depositSchedule.id,
      amountCents: adjustedDepositCents,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
    })

    const scheduleCountAfter = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        direction: PaymentScheduleDirection.receivable,
      },
    })
    expect(scheduleCountAfter).toBe(scheduleCountBefore)

    const balanceAfter = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${balanceSchedule.id}`)
      .expect(200)
    expect(balanceAfter.body.data).toMatchObject({
      id: balanceSchedule.id,
      amountCents: balancePathCents,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      settledAmountCents: 0,
    })

    const sourceAfter = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrderId}`)
      .expect(200)
    expect(sourceAfter.body.data).toMatchObject({
      depositCents: adjustedDepositCents,
      balanceCents: balancePathCents,
      guestCollectCents: adjustedDepositCents + balancePathCents,
      netReceivableCents: netCents,
      collectionMode: SourceOrderCollectionMode.guest_only,
      hasSourceAmountMismatch: false,
    })

    const tabs = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)
    expect(tabs.body.data.total).toBe(2)
    const tabDeposit = tabs.body.data.items.find(
      (item: { id: string }) => item.id === depositSchedule.id,
    )
    const tabGuest = tabs.body.data.items.find(
      (item: { id: string }) => item.id === balanceSchedule.id,
    )
    expect(tabDeposit.amountCents).toBe(adjustedDepositCents)
    expect(tabGuest.amountCents).toBe(balancePathCents)

    const departureSummary = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(departureSummary.body.data.openUnsettledReceivableCents).toBe(
      adjustedDepositCents + balancePathCents,
    )
  })
})
