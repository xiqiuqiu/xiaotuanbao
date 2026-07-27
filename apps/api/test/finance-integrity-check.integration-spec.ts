import {
  CounterpartyType,
  PaymentChannel,
  PaymentScheduleDirection,
  PrismaClient,
  SourceOrderCollectionMode,
  TransactionDirection,
  VerificationStatus,
} from '@prisma/client'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { collectFinanceIntegrityViolations } from '../scripts/finance-integrity-check'

describe('finance-integrity-check (integration)', () => {
  const prisma = new PrismaClient()
  const testPrefix = `integrity-${Date.now()}`
  let organizationId: string
  let userId: string
  let departureId: string
  let scheduleId: string
  let transactionId: string
  let sourceOrderId: string

  beforeAll(async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { username: 'admin', deletedAt: null },
    })
    organizationId = user.organizationId
    userId = user.id

    const departure = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `${testPrefix}-DEP`,
        name: `${testPrefix}-发团`,
        routeName: '完整性测试路线',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-02T00:00:00.000Z'),
        dayCount: 2,
        ownerUserId: userId,
      },
    })
    departureId = departure.id

    const schedule = await prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: `${testPrefix}-AR`,
        title: '故障注入应收',
        amountCents: 10000,
        dueDate: new Date('2026-07-02T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: '故障注入对象',
      },
    })
    scheduleId = schedule.id

    const transaction = await prisma.financeTransaction.create({
      data: {
        organizationId,
        transactionNo: `${testPrefix}-TX`,
        direction: TransactionDirection.inflow,
        paymentChannel: PaymentChannel.other,
        amountCents: 10000,
        transactionDate: new Date('2026-07-02T00:00:00.000Z'),
        counterpartyType: CounterpartyType.partner,
        counterpartyName: '故障注入对象',
        departureId,
      },
    })
    transactionId = transaction.id

    const partner = await prisma.partner.findFirstOrThrow({
      where: { organizationId },
    })
    const sourceOrder = await prisma.sourceOrder.create({
      data: {
        departureId,
        partnerId: partner.id,
        displayName: `${testPrefix}-游客代收`,
        guestCount: 1,
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 10000,
        childUnitPriceCents: 0,
        grossReceivableCents: 10000,
        netReceivableCents: 10000,
        collectionMode: SourceOrderCollectionMode.guest_only,
        depositCents: 0,
        balanceCents: 10000,
        partnerCollectedCents: 0,
        guestCollectCents: 10000,
      },
    })
    sourceOrderId = sourceOrder.id

    const guestSchedule = await prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: `${testPrefix}-GUEST-AR`,
        title: '游客代收',
        amountCents: 10000,
        dueDate: new Date('2026-07-02T00:00:00.000Z'),
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrderId,
        counterpartyName: sourceOrder.displayName,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
        sourceId: sourceOrderId,
      },
    })
    const guestTransaction = await prisma.financeTransaction.create({
      data: {
        organizationId,
        transactionNo: `${testPrefix}-GUEST-TX`,
        direction: TransactionDirection.inflow,
        paymentChannel: PaymentChannel.other,
        amountCents: 10000,
        transactionDate: new Date('2026-07-02T00:00:00.000Z'),
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrderId,
        counterpartyName: '展示名允许不同',
        departureId,
      },
    })
    await prisma.financeVerification.create({
      data: {
        organizationId,
        verificationNo: `${testPrefix}-GUEST-CL`,
        paymentScheduleId: guestSchedule.id,
        transactionId: guestTransaction.id,
        amountCents: 10000,
        verificationDate: new Date('2026-07-02T00:00:00.000Z'),
        createdBy: userId,
        billUnsettledAfterCents: 0,
        status: VerificationStatus.normal,
      },
    })

    await prisma.financeIdempotencyRecord.create({
      data: {
        organizationId,
        operation: 'fault-injection',
        idempotencyKey: `${testPrefix}-INCOMPLETE-IDEMPOTENCY`,
        requestHash: 'fault-injection',
      },
    })

    await prisma.financeVerification.create({
      data: {
        organizationId,
        verificationNo: `${testPrefix}-CL`,
        paymentScheduleId: scheduleId,
        transactionId,
        amountCents: 20000,
        verificationDate: new Date('2026-07-02T00:00:00.000Z'),
        createdBy: userId,
        billUnsettledAfterCents: -10000,
        status: VerificationStatus.normal,
      },
    })
  })

  afterAll(async () => {
    await prisma.financeIdempotencyRecord.deleteMany({
      where: { organizationId, idempotencyKey: { startsWith: testPrefix } },
    })
    await prisma.financeVerification.deleteMany({ where: { organizationId, verificationNo: { startsWith: testPrefix } } })
    await prisma.financeTransaction.deleteMany({ where: { organizationId, transactionNo: { startsWith: testPrefix } } })
    await prisma.paymentSchedule.deleteMany({ where: { organizationId, scheduleNo: { startsWith: testPrefix } } })
    await prisma.sourceOrder.deleteMany({ where: { id: sourceOrderId } })
    await prisma.departure.deleteMany({ where: { organizationId, departureNo: { startsWith: testPrefix } } })
    await prisma.$disconnect()
  })

  it('reports over-allocation and negative remaining balances with business numbers', async () => {
    const violations = await collectFinanceIntegrityViolations(prisma)
    const injected = violations.filter((item) =>
      Object.values(item.refs).some((value) => value?.startsWith(testPrefix)),
    )

    expect(injected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SCHEDULE_OVERALLOCATED',
          severity: 'P0',
          refs: expect.objectContaining({ scheduleNo: `${testPrefix}-AR` }),
        }),
        expect.objectContaining({
          code: 'SCHEDULE_NEGATIVE_REMAINING',
          severity: 'P0',
          refs: expect.objectContaining({ scheduleNo: `${testPrefix}-AR` }),
        }),
        expect.objectContaining({
          code: 'TRANSACTION_OVERALLOCATED',
          severity: 'P0',
          refs: expect.objectContaining({ transactionNo: `${testPrefix}-TX` }),
        }),
        expect.objectContaining({
          code: 'TRANSACTION_NEGATIVE_REMAINING',
          severity: 'P0',
          refs: expect.objectContaining({ transactionNo: `${testPrefix}-TX` }),
        }),
      ]),
    )
  })

  it('accepts a guest counterparty backed by a source order in the same departure', async () => {
    const violations = await collectFinanceIntegrityViolations(prisma)
    const guestViolations = violations.filter(
      (item) =>
        item.refs.scheduleNo === `${testPrefix}-GUEST-AR` ||
        item.refs.transactionNo === `${testPrefix}-GUEST-TX` ||
        item.refs.verificationNo === `${testPrefix}-GUEST-CL`,
    )

    expect(guestViolations).toEqual([])
  })

  it('reports a guest counterparty whose source-order reference is broken', async () => {
    await prisma.financeTransaction.updateMany({
      where: { organizationId, transactionNo: `${testPrefix}-GUEST-TX` },
      data: { counterpartyId: `${testPrefix}-missing-source-order` },
    })

    try {
      const violations = await collectFinanceIntegrityViolations(prisma)
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'COUNTERPARTY_REFERENCE_BROKEN',
            severity: 'P0',
            refs: expect.objectContaining({ transactionNo: `${testPrefix}-GUEST-TX` }),
          }),
        ]),
      )
    } finally {
      await prisma.financeTransaction.updateMany({
        where: { organizationId, transactionNo: `${testPrefix}-GUEST-TX` },
        data: { counterpartyId: sourceOrderId },
      })
    }
  })

  it('reports an idempotency record that was not completed atomically', async () => {
    const violations = await collectFinanceIntegrityViolations(prisma)

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INCOMPLETE_IDEMPOTENCY_RECORD',
          severity: 'P1',
          refs: expect.objectContaining({
            idempotencyKey: `${testPrefix}-INCOMPLETE-IDEMPOTENCY`,
          }),
        }),
      ]),
    )
  })
})
