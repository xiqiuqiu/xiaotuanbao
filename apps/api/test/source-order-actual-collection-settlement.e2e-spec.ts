import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Source order settle by actual collection (e2e) #192', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let partnerName: string
  const testPrefix = `e2e-so-settle-${Date.now()}`

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
    partnerName = partner.name
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
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '测试路线',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        ownerUserId,
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  async function createSourceOrder(
    departureId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 500000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        depositCents: 100000,
        balanceCents: 400000,
        ...overrides,
      })
      .expect(201)

    return response.body.data as {
      id: string
      displayName: string
      netReceivableCents: number
    }
  }

  async function generateReceivables(sourceOrderId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)
    return response.body.data.schedules as Array<{
      id: string
      sourceType: string
      amountCents: number
    }>
  }

  async function confirmCollection(params: {
    scheduleId: string
    amountCents: number
    counterpartyName: string
  }) {
    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${params.scheduleId}/confirm-collection`)
      .send({
        amountCents: params.amountCents,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: params.counterpartyName,
      })
      .expect(201)
  }

  async function settleFullyCollectedGuestNodes(
    sourceOrder: { id: string; displayName: string },
    schedules: Array<{ id: string; sourceType: string; amountCents: number }>,
  ) {
    for (const schedule of schedules) {
      if (
        schedule.sourceType ===
          PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION ||
        schedule.sourceType ===
          PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION
      ) {
        await confirmCollection({
          scheduleId: schedule.id,
          amountCents: schedule.amountCents,
          counterpartyName: sourceOrder.displayName,
        })
      }
    }
  }

  it.each([
    {
      name: 'P=200 G=6000 → rebate 1000, no top-up',
      depositCents: 20000,
      balanceCents: 580000,
      verifyDeposit: 20000,
      verifyBalance: 580000,
      topUp: 0,
      rebate: 100000,
    },
    {
      name: 'P=4500 G=1000 → top-up 4000, no rebate',
      depositCents: 450000,
      balanceCents: 100000,
      collectionMode: SourceOrderCollectionMode.split,
      verifyDeposit: 0,
      verifyBalance: 100000,
      topUp: 400000,
      rebate: 0,
    },
    {
      name: 'P=4500 G=200 → top-up 4800, no rebate',
      depositCents: 450000,
      balanceCents: 20000,
      collectionMode: SourceOrderCollectionMode.split,
      verifyDeposit: 0,
      verifyBalance: 20000,
      topUp: 480000,
      rebate: 0,
    },
  ])(
    'S=5000 acceptance: $name',
    async ({
      depositCents,
      balanceCents,
      collectionMode,
      verifyDeposit,
      verifyBalance,
      topUp,
      rebate,
    }) => {
      const departure = await createDeparture()
      const sourceOrder = await createSourceOrder(departure.id, {
        depositCents,
        balanceCents,
        ...(collectionMode ? { collectionMode } : {}),
      })
      expect(sourceOrder.netReceivableCents).toBe(500000)

      const schedules = await generateReceivables(sourceOrder.id)
      const byType = Object.fromEntries(
        schedules.map((item) => [item.sourceType, item]),
      )

      if (verifyDeposit > 0) {
        await confirmCollection({
          scheduleId:
            byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION].id,
          amountCents: verifyDeposit,
          counterpartyName: sourceOrder.displayName,
        })
      }
      if (verifyBalance > 0) {
        await confirmCollection({
          scheduleId:
            byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION].id,
          amountCents: verifyBalance,
          counterpartyName: sourceOrder.displayName,
        })
      }

      // 游客代收齐账后自动落补款/返利，无需再点「按实收结算」
      const topUpSchedule = await prisma.paymentSchedule.findFirst({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          cancelledAt: null,
        },
      })
      const rebateSchedule = await prisma.paymentSchedule.findFirst({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          cancelledAt: null,
        },
      })

      if (topUp > 0) {
        expect(topUpSchedule).toMatchObject({
          amountCents: topUp,
          direction: PaymentScheduleDirection.receivable,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partnerId,
          counterpartyName: partnerName,
          title: '客户补款',
        })
      } else {
        expect(topUpSchedule).toBeNull()
      }

      if (rebate > 0) {
        expect(rebateSchedule).toMatchObject({
          amountCents: rebate,
          direction: PaymentScheduleDirection.payable,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: partnerId,
          counterpartyName: partnerName,
          title: '返利',
        })
      } else {
        expect(rebateSchedule).toBeNull()
      }

      // API 仍可幂等重跑
      const settled = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
        .send({})
        .expect(201)

      expect(settled.body.data).toMatchObject({
        actualGuestCollectedCents: verifyDeposit + verifyBalance,
        customerTopUpCents: topUp,
        rebateCents: rebate,
      })
    },
  )

  it('G实收 ignores unverified income transactions and does not early-settle', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      depositCents: 0,
      balanceCents: 500000,
    })
    const schedules = await generateReceivables(sourceOrder.id)
    const balance = schedules[0]

    // 未核销流水：不计入 G实收
    await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'inflow',
        amountCents: 500000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrder.id,
        counterpartyName: sourceOrder.displayName,
        departureId: departure.id,
      })
      .expect(201)

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
      .send({})
      .expect(400)
    expect(rejected.body.message).toContain('尚未结清')

    await confirmCollection({
      scheduleId: balance.id,
      amountCents: 200000,
      counterpartyName: sourceOrder.displayName,
    })

    // 未齐账：不提前落补款
    expect(
      await prisma.paymentSchedule.findFirst({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          cancelledAt: null,
        },
      }),
    ).toBeNull()

    // G实收=S → 无补款无返利
    expect(
      await prisma.paymentSchedule.findFirst({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: {
            in: [
              PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
              PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
            ],
          },
          cancelledAt: null,
        },
      }),
    ).toBeNull()
  })

  it('auto-settles to rebate when guest nodes become fully collected', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      depositCents: 20000,
      balanceCents: 600000,
    })
    expect(sourceOrder.netReceivableCents).toBe(500000)

    const guestSchedules = await generateReceivables(sourceOrder.id)
    const deposit = guestSchedules.find(
      (s) =>
        s.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
    )!
    const balance = guestSchedules.find(
      (s) =>
        s.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    )!

    // 未齐：无返利
    await confirmCollection({
      scheduleId: deposit.id,
      amountCents: deposit.amountCents,
      counterpartyName: sourceOrder.displayName,
    })
    expect(
      await prisma.paymentSchedule.findFirst({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          cancelledAt: null,
        },
      }),
    ).toBeNull()

    await confirmCollection({
      scheduleId: balance.id,
      amountCents: balance.amountCents,
      counterpartyName: sourceOrder.displayName,
    })

    const rebateSchedule = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        cancelledAt: null,
      },
    })
    expect(rebateSchedule).toMatchObject({
      amountCents: 120000,
      title: '返利',
    })
  })

  it('rejects silent recalculation after top-up is finance-touched', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 450000,
      balanceCents: 100000,
    })
    const schedules = await generateReceivables(sourceOrder.id)
    await settleFullyCollectedGuestNodes(sourceOrder, schedules)

    const first = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
      .send({})
      .expect(201)
    const topUpId = first.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    ).id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${topUpId}/confirm-collection`)
      .send({
        amountCents: 100000,
        transactionDate: '2026-07-02',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: partnerName,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
      .send({})
      .expect(400)
    expect(blocked.body.message).toContain('不能静默重算')
  })

  it('rebate payable is visible in global payables and partner ledger and can be paid', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      depositCents: 20000,
      balanceCents: 580000,
    })
    const schedules = await generateReceivables(sourceOrder.id)
    await settleFullyCollectedGuestNodes(sourceOrder, schedules)

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
      .send({})
      .expect(201)

    const payables = await authRequest(app, financeToken)
      .get('/api/finance/payables')
      .query({ departureId: departure.id, pageSize: 50 })
      .expect(200)

    const rebate = payables.body.data.items.find(
      (item: { sourceType: string; sourceId: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE &&
        item.sourceId === sourceOrder.id,
    )
    expect(rebate).toMatchObject({
      amountCents: 100000,
      title: '返利',
      counterpartyId: partnerId,
    })

    const partnerPayables = await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/payables`)
      .query({ pageSize: 50 })
      .expect(200)

    expect(
      partnerPayables.body.data.items.some(
        (item: { sourceType: string; sourceId: string }) =>
          item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE &&
          item.sourceId === sourceOrder.id,
      ),
    ).toBe(true)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${rebate.id}/confirm-payment`)
      .send({
        amountCents: 100000,
        transactionDate: '2026-07-06',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: partnerName,
      })
      .expect(201)

    const paid = await prisma.paymentSchedule.findFirstOrThrow({
      where: { id: rebate.id },
    })
    const settledAmountCents = await prisma.financeVerification.aggregate({
      where: { paymentScheduleId: rebate.id, status: 'normal' },
      _sum: { amountCents: true },
    })
    expect(settledAmountCents._sum.amountCents).toBe(100000)
    expect(paid.amountCents).toBe(100000)
  })

  it('rejects partner_settled mode', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.partner_settled,
      depositCents: 0,
      balanceCents: 0,
    })
    await generateReceivables(sourceOrder.id)

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/settle-by-actual-collection`)
      .send({})
      .expect(400)
    expect(rejected.body.message).toContain('全部客户结算')
  })

  it('does not auto-create rebate payable without settle action', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      depositCents: 20000,
      balanceCents: 580000,
    })
    await generateReceivables(sourceOrder.id)

    const rebateCount = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        cancelledAt: null,
      },
    })
    expect(rebateCount).toBe(0)
  })
})
