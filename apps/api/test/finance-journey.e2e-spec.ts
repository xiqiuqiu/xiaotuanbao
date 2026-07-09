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
import { PaymentChannel, PaymentScheduleStatus } from '@xiaotuanbao/shared'
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
      payableScheduleId: payable.body.data.schedule.id as string,
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
      collectedCents: 1000000,
      uncollectedCents: 0,
      paidCents: 360000,
      unpaidCents: 0,
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
      .query({ paymentScheduleId: schedules.receivableScheduleId, pageSize: 10 })
      .expect(200)
    expect(arVerifications.body.data.items).toHaveLength(1)
    expect(arVerifications.body.data.items[0].verificationNo).toMatch(CL_NO_REGEX)

    const apVerifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ paymentScheduleId: schedules.payableScheduleId, pageSize: 10 })
      .expect(200)
    expect(apVerifications.body.data.items).toHaveLength(1)

    const settledDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(settledDetail.body.data.isFinanciallySettled).toBe(true)
    expect(settledDetail.body.data.collectedCents).toBe(1000000)
    expect(settledDetail.body.data.paidCents).toBe(360000)

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
      collectedCents: 0,
      uncollectedCents: 1000000,
      paidCents: 0,
      unpaidCents: 360000,
      completionTags: {
        receivables: '应收已生成',
        payables: '应付已生成',
      },
    })

    const txDetail = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${inflow.body.data.id}`)
      .expect(200)
    expect(txDetail.body.data.allocatedAmountCents).toBe(0)
    expect(txDetail.body.data.unallocatedAmountCents).toBe(1000000)
  })

  it('settles split receivables and keeps coordinator departure tabs in sync', async () => {
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
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 400000,
      })
      .expect(201)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id}/generate-receivables`)
      .expect(201)

    expect(generated.body.data.schedules).toHaveLength(2)

    const customerSchedule = generated.body.data.schedules.find(
      (item: { counterpartyType: string }) =>
        item.counterpartyType === CounterpartyType.partner,
    )
    const guestSchedule = generated.body.data.schedules.find(
      (item: { counterpartyType: string }) =>
        item.counterpartyType === CounterpartyType.guest,
    )
    expect(customerSchedule.amountCents).toBe(400000)
    expect(guestSchedule.amountCents).toBe(600000)

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
      .post(`/api/finance/receivables/${customerSchedule.id}/confirm-collection`)
      .send({
        amountCents: 400000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-partner`,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${guestSchedule.id}/confirm-collection`)
      .send({
        amountCents: 600000,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.CASH,
        counterpartyType: CounterpartyType.guest,
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
    expect(detail.body.data.collectedCents).toBe(1000000)
    expect(detail.body.data.uncollectedCents).toBe(0)
    expect(detail.body.data.completionTags.receivables).toBe('已收齐')

    const forbidden = await authRequest(app, coordinatorToken)
      .post(`/api/finance/receivables/${guestSchedule.id}/confirm-collection`)
      .send({
        amountCents: 1,
        transactionDate: '2026-08-04',
        paymentChannel: PaymentChannel.OTHER,
      })
      .expect(403)
    expect(forbidden.body.message).toBe('无权访问')
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
                counterpartyType: CounterpartyType.partner,
                partnerId,
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
    expect(beforeFinance.body.data.completionTags.receivables).toBe('应收未生成')
    expect(beforeFinance.body.data.completionTags.payables).toBe('应付未生成')
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

    const supplierPayable = payablesTab.body.data.items.find(
      (item: { counterpartyType: string }) =>
        item.counterpartyType === CounterpartyType.supplier,
    )
    const partnerPayable = payablesTab.body.data.items.find(
      (item: { counterpartyType: string }) =>
        item.counterpartyType === CounterpartyType.partner,
    )
    expect(supplierPayable.amountCents).toBe(200000)
    expect(partnerPayable.amountCents).toBe(150000)

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
      .post(`/api/finance/payables/${supplierPayable.id}/confirm-payment`)
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
      .post(`/api/finance/payables/${partnerPayable.id}/confirm-payment`)
      .send({
        amountCents: 150000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.WECHAT,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-partner`,
      })
      .expect(201)

    const settledDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.body.data.id}`)
      .expect(200)
    expect(settledDetail.body.data).toMatchObject({
      isFinanciallySettled: true,
      collectedCents: 500000,
      paidCents: 350000,
      unpaidCents: 0,
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
      collectedCents: 400000,
      uncollectedCents: 600000,
      paidCents: 100000,
      unpaidCents: 260000,
      completionTags: {
        receivables: '应收已生成',
        payables: '应付已生成',
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
      collectedCents: 1000000,
      uncollectedCents: 0,
      paidCents: 360000,
      unpaidCents: 0,
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
      .query({ paymentScheduleId: schedules.receivableScheduleId, pageSize: 10 })
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
    expect(detail.body.data.collectedCents).toBe(1000000)
    expect(detail.body.data.completionTags.receivables).toBe('已收齐')
  })

  it('reaches financially settled by cancelling unpaid payable schedule', async () => {
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
    expect(beforeCancel.body.data.unpaidCents).toBe(360000)

    const cancelled = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${schedules.payableScheduleId}/cancel`)
      .send({ cancelReason: '供应商改免费接待，关闭应付' })
      .expect(201)
    expect(cancelled.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

    const afterCancel = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(afterCancel.body.data).toMatchObject({
      isFinanciallySettled: true,
      collectedCents: 1000000,
      paidCents: 0,
      unpaidCents: 0,
      completionTags: {
        receivables: '已收齐',
        payables: '已付清',
      },
    })

    const cancelledPayable = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedules.payableScheduleId}`)
      .expect(200)
    expect(cancelledPayable.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)

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

  it('blocks finance generation after departure is closed', async () => {
    const departure = await createDeparture('closed-block')
    const ops = await seedOps(departure.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .expect(201)

    const blockedReceivable = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${ops.sourceOrderId}/generate-receivables`)
      .expect(409)
    expect(blockedReceivable.body.message).toBe('发团已关闭，不可生成应收')

    const blockedPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${ops.resourceId}/generate-payable`)
      .expect(409)
    expect(blockedPayable.body.message).toBe('发团已关闭，不可生成应付')

    const patchBlocked = await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({ name: `${testPrefix}-不应改` })
      .expect(409)
    expect(patchBlocked.body.message).toBe('发团已关闭，不可编辑')
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
      segmentCount: 1,
      resourceCount: 1,
      collectedCents: 0,
      paidCents: 0,
      completionTags: {
        receivables: '应收未生成',
        payables: '应付未生成',
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

    const copiedResourceAmountCents = 88000
    await prisma.segmentResource.update({
      where: { id: resource.id },
      data: { amountCents: copiedResourceAmountCents },
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
    expect(settledCopy.body.data.collectedCents).toBe(320000)

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
        guestCollectCents: 900000,
      },
    })

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${ops.sourceOrderId}/generate-receivables`)
      .expect(409)
    expect(regenerated.body.message).toBe('当前客源单已生成应收，不能再次生成')

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
    expect(detail.body.data.collectedCents).toBe(300000)
    expect(detail.body.data.uncollectedCents).toBe(700000)
    expect(detail.body.data.isFinanciallySettled).toBe(false)
  })
})
