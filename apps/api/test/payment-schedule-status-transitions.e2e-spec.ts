import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleStatus } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * B-layer: Payment Schedule status transitions.
 *
 * Seam: HTTP finance schedule / verification APIs (derived status on responses).
 *
 * @see packages/shared derive-schedule-state.spec.ts — pure status derivation
 * @see finance.e2e-spec.ts — settled→pending via cancel verification (B5)
 * @see finance-journey.e2e-spec.ts — cancel verification on closed keeps cancelled (B6)
 */
describe('Payment schedule status transitions (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  const testPrefix = `e2e-ps-status-${Date.now()}`

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
    await prisma.supplier.deleteMany({
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
        routeName: '节点状态路线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  it('B1: receivable with past dueDate derives overdue', async () => {
    const departure = await createDeparture('b1-overdue')
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-逾期应收`,
        amountCents: 100_000,
        dueDate: '2026-06-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '逾期客人',
      })
      .expect(201)

    expect(created.body.data).toMatchObject({
      status: PaymentScheduleStatus.OVERDUE,
      settledAmountCents: 0,
      unsettledAmountCents: 100_000,
    })
  })

  it('B2: overdue → cancelled → reopen(overdue) → settled chain', async () => {
    const departure = await createDeparture('b2-overdue-chain')
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-逾期贯穿`,
        amountCents: 120_000,
        dueDate: '2026-06-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '贯穿客人',
      })
      .expect(201)
    const scheduleId = created.body.data.id as string

    expect(created.body.data.status).toBe(PaymentScheduleStatus.OVERDUE)

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '逾期应收临时停止追收',
      })
      .expect(201)
    expect(closed.body.data).toMatchObject({
      status: PaymentScheduleStatus.CANCELLED,
      unsettledAmountCents: 120_000,
    })

    const reopened = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/reopen`)
      .send({ reopenReason: '恢复逾期追收' })
      .expect(201)
    expect(reopened.body.data).toMatchObject({
      status: PaymentScheduleStatus.OVERDUE,
      cancelledAt: null,
      unsettledAmountCents: 120_000,
    })

    const settled = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 120_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '贯穿客人',
      })
      .expect(201)
    expect(settled.body.data).toMatchObject({
      status: PaymentScheduleStatus.SETTLED,
      settledAmountCents: 120_000,
      unsettledAmountCents: 0,
    })
  })

  it('B3: payable past dueDate stays pending (never overdue)', async () => {
    const departure = await createDeparture('b3-payable-no-overdue')
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-应付无逾期`,
        amountCents: 90_000,
        dueDate: '2026-06-01',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    expect(created.body.data).toMatchObject({
      status: PaymentScheduleStatus.PENDING,
      unsettledAmountCents: 90_000,
    })
    expect(created.body.data.status).not.toBe(PaymentScheduleStatus.OVERDUE)
  })

  it('B4: partial verification keeps pending/overdue storage status (no partial enum)', async () => {
    const departure = await createDeparture('b4-partial')

    const pendingSchedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-部分待收`,
        amountCents: 100_000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '部分客人',
      })
      .expect(201)

    const partialPending = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${pendingSchedule.body.data.id}/confirm-collection`)
      .send({
        amountCents: 40_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '部分客人',
      })
      .expect(201)

    expect(partialPending.body.data).toMatchObject({
      status: PaymentScheduleStatus.PENDING,
      settledAmountCents: 40_000,
      unsettledAmountCents: 60_000,
    })
    expect(partialPending.body.data.status).not.toBe('partial')

    const overdueSchedule = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-部分逾期`,
        amountCents: 100_000,
        dueDate: '2026-06-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '部分逾期客人',
      })
      .expect(201)

    const partialOverdue = await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${overdueSchedule.body.data.id}/confirm-collection`)
      .send({
        amountCents: 40_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '部分逾期客人',
      })
      .expect(201)

    expect(partialOverdue.body.data).toMatchObject({
      status: PaymentScheduleStatus.OVERDUE,
      settledAmountCents: 40_000,
      unsettledAmountCents: 60_000,
    })
  })

  it('B7: untouched resource payable voids only; touched payable closes only', async () => {
    const departure = await createDeparture('b7-void-close')
    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '作废关闭段',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        destination: '门禁',
      })
      .expect(201)

    const untouchedResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '未介入用车',
        amountCents: 60_000,
      })
      .expect(201)
    const untouchedPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${untouchedResource.body.data.id}/generate-payable`)
      .expect(201)
    const untouchedScheduleId = untouchedPayable.body.data.schedule.id as string

    const closeUntouched = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${untouchedScheduleId}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '未介入不应关闭' })
      .expect(400)
    expect(closeUntouched.body.message).toBe('财务未介入的资源应付请使用作废')

    await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${untouchedScheduleId}/void-resource-payable`)
      .send({ voidReason: '未介入资源应付作废' })
      .expect(201)

    const touchedResource = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '已介入用车',
        amountCents: 70_000,
      })
      .expect(201)
    const touchedPayable = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${touchedResource.body.data.id}/generate-payable`)
      .expect(201)
    const touchedScheduleId = touchedPayable.body.data.schedule.id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${touchedScheduleId}/confirm-payment`)
      .send({
        amountCents: 20_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        counterpartyName: `${testPrefix}-supplier`,
      })
      .expect(201)

    const voidTouched = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${touchedScheduleId}/void-resource-payable`)
      .send({ voidReason: '已介入不应作废' })
      .expect(400)
    expect(voidTouched.body.message).toBe('已有核销历史的资源应付不可作废')

    const closed = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${touchedScheduleId}/cancel`)
      .send({
        closeDisposition: 'other',
        cancelReason: '已介入未结清可关闭',
      })
      .expect(201)
    expect(closed.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)
  })
})
