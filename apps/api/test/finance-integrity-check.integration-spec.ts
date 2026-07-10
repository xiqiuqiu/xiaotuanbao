import {
  CounterpartyType,
  PaymentChannel,
  PaymentScheduleDirection,
  PrismaClient,
  TransactionDirection,
  VerificationStatus,
} from '@prisma/client'
import { collectFinanceIntegrityViolations } from '../scripts/finance-integrity-check'

describe('finance-integrity-check (integration)', () => {
  const prisma = new PrismaClient()
  const testPrefix = `integrity-${Date.now()}`
  let organizationId: string
  let userId: string
  let departureId: string
  let scheduleId: string
  let transactionId: string

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
        counterpartyType: CounterpartyType.manual,
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
        counterpartyType: CounterpartyType.manual,
        counterpartyName: '故障注入对象',
        departureId,
      },
    })
    transactionId = transaction.id

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
    await prisma.financeVerification.deleteMany({ where: { organizationId, verificationNo: { startsWith: testPrefix } } })
    await prisma.financeTransaction.deleteMany({ where: { organizationId, transactionNo: { startsWith: testPrefix } } })
    await prisma.paymentSchedule.deleteMany({ where: { organizationId, scheduleNo: { startsWith: testPrefix } } })
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
})
