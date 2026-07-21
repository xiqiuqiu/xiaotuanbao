import type { INestApplication } from '@nestjs/common'
import { CounterpartyType, DepartureStatus } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * A-layer: Departure status transition matrix.
 *
 * Seam: HTTP `/api/departures/:id/transition|close|unarchive`.
 *
 * @see departure.e2e-spec.ts — editing→pending_settlement; settlement gate (A1/A3)
 */
describe('Departure status transitions (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-dep-status-${Date.now()}`

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
        paymentSchedule: { departure: { name: { startsWith: testPrefix } } },
      },
    })
    await prisma.financeTransaction.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
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
        routeName: '发团状态路线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string; status: DepartureStatus }
  }

  async function markPendingSettlement(departureId: string) {
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)
  }

  /** Empty Departure is not financially settled (no schedules ⇒ gate false). */
  async function settleWithClosedObligation(departureId: string) {
    const receivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId,
        title: `${testPrefix}-门槛应收`,
        amountCents: 10_000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '门槛客人',
      })
      .expect(201)
    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.id}/confirm-collection`)
      .send({
        amountCents: 10_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '门槛客人',
      })
      .expect(201)
    await markPendingSettlement(departureId)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)
  }

  describe('A2: illegal transition matrix', () => {
    const illegalCases: Array<{
      name: string
      setup: (departureId: string) => Promise<void>
      targetStatus: DepartureStatus
      expectedStatus?: number
      expectedMessage: string
    }> = [
      {
        name: 'pending_settlement → editing',
        setup: markPendingSettlement,
        targetStatus: DepartureStatus.editing,
        expectedMessage: '不允许的状态转换',
      },
      {
        name: 'editing → settled (skip pending_settlement)',
        setup: async () => undefined,
        targetStatus: DepartureStatus.settled,
        expectedMessage: '不允许的状态转换',
      },
      {
        name: 'settled → editing',
        setup: settleWithClosedObligation,
        targetStatus: DepartureStatus.editing,
        expectedMessage: '不允许的状态转换',
      },
      {
        name: 'settled → pending_settlement via transition API',
        setup: settleWithClosedObligation,
        targetStatus: DepartureStatus.pending_settlement,
        expectedMessage: '不允许的状态转换',
      },
      {
        name: 'closed → pending_settlement via transition API',
        setup: async (departureId) => {
          await authRequest(app, coordinatorToken)
            .post(`/api/departures/${departureId}/close`)
            .send({ reason: '非法 transition 探针' })
            .expect(201)
        },
        targetStatus: DepartureStatus.pending_settlement,
        expectedStatus: 409,
        expectedMessage: '发团已关闭，不可变更状态',
      },
    ]

    it.each(illegalCases)(
      'rejects $name',
      async ({ setup, targetStatus, expectedStatus = 400, expectedMessage }) => {
        const departure = await createDeparture(
          `a2-${targetStatus}-${Math.random().toString(36).slice(2, 7)}`,
        )
        await setup(departure.id)

        const response = await authRequest(app, coordinatorToken)
          .post(`/api/departures/${departure.id}/transition`)
          .send({ targetStatus })
          .expect(expectedStatus)

        expect(response.body.message).toBe(expectedMessage)
      },
    )
  })

  describe('A4: archive from each non-closed status', () => {
    const sources: Array<{
      name: string
      setup: (departureId: string) => Promise<void>
    }> = [
      { name: 'editing', setup: async () => undefined },
      { name: 'pending_settlement', setup: markPendingSettlement },
      { name: 'settled', setup: settleWithClosedObligation },
    ]

    it.each(sources)('archives from $name and blocks patch', async ({ name, setup }) => {
      const departure = await createDeparture(`a4-${name}`)
      await setup(departure.id)

      const closed = await authRequest(app, coordinatorToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: `从${name}归档` })
        .expect(201)
      expect(closed.body.data.status).toBe(DepartureStatus.closed)

      const patch = await authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ name: `${testPrefix}-${name}-blocked` })
        .expect(409)
      expect(patch.body.message).toBe('发团已关闭，不可编辑')
    })
  })

  it('A5: closed Departure only returns via unarchive to pending_settlement', async () => {
    const departure = await createDeparture('a5-unarchive')
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .send({ reason: '待解除归档' })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.editing })
      .expect(409)

    const unarchived = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/unarchive`)
      .send({ reason: '继续处理账款' })
      .expect(201)

    expect(unarchived.body.data.status).toBe(DepartureStatus.pending_settlement)
  })

  it('A6: manual transition cannot forge settled → pending_settlement rollback', async () => {
    const departure = await createDeparture('a6-no-forge-rollback')
    const receivable = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-回退对照`,
        amountCents: 50_000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '回退客人',
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${receivable.body.data.id}/confirm-collection`)
      .send({
        amountCents: 50_000,
        transactionDate: '2026-08-05',
        paymentChannel: PaymentChannel.BANK_TRANSFER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: '回退客人',
      })
      .expect(201)

    await markPendingSettlement(departure.id)
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.settled })
      .expect(201)

    const forged = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(400)
    expect(forged.body.message).toBe('不允许的状态转换')

    const stillSettled = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)
    expect(stillSettled.body.data.status).toBe(DepartureStatus.settled)
    expect(stillSettled.body.data.settlementHistory ?? []).toEqual([])
  })
})
