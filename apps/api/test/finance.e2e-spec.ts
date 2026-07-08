import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  SupplierCategory,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentScheduleStatus, PaymentChannel } from '@xiaotuanbao/shared'
import { authRequest, AR_AP_SCHEDULE_NO_REGEX, CL_NO_REGEX, createTestApp, loginAs, TX_NO_REGEX, uniqueBusinessPrefix } from './helpers'

describe('Finance API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  let ownerUserId: string
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
        category: SupplierCategory.transport,
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: { organizationId },
    })
    await prisma.financeTransaction.deleteMany({
      where: { organizationId },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departureId: { in: [departureId, otherDepartureId] },
      },
    })
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        departureNo: { startsWith: testPrefix },
      },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('returns 403 for coordinator on POST /finance/receivables', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/finance/receivables')
      .send(schedulePayload())
      .expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for coordinator on POST /finance/payables', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/finance/payables')
      .send(schedulePayload({ title: `${testPrefix}-应付` }))
      .expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
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
    expect(response.body.data.financeTouched).toBe(true)
  })

  it('cancels schedule and returns cancelled status', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-待关闭` }))
      .expect(201)

    const response = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ cancelReason: '测试关闭' })
      .expect(201)

    expect(response.body.data.cancelledAt).toBeTruthy()
    expect(response.body.data.status).toBe(PaymentScheduleStatus.CANCELLED)
    expect(response.body.data.financeTouched).toBe(true)
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
        counterpartyType: CounterpartyType.manual,
      },
    })

    const response = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${foreignSchedule.id}`)
      .expect(404)

    expect(response.body.code).toBe(404)

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
      .query({ paymentScheduleId: created.body.data.id, pageSize: 10 })
      .expect(200)

    expect(verifications.body.data.items).toHaveLength(1)
    expect(verifications.body.data.items[0].verificationNo).toMatch(CL_NO_REGEX)
    expect(verifications.body.data.items[0].transactionId).toBe(transaction.body.data.id)
    expect(verifications.body.data.items[0].amountCents).toBe(50000)

    const linkedTransaction = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transaction.body.data.id}`)
      .expect(200)

    expect(linkedTransaction.body.data.allocatedAmountCents).toBe(50000)
    expect(linkedTransaction.body.data.unallocatedAmountCents).toBe(0)
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
      .query({ paymentScheduleId: created.body.data.id, pageSize: 10 })
      .expect(200)

    const verificationId = verifications.body.data.items[0].id

    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .expect(201)

    const schedule = await authRequest(app, financeToken)
      .get(`/api/finance/receivables/${created.body.data.id}`)
      .expect(200)

    expect(schedule.body.data.settledAmountCents).toBe(0)
    expect(schedule.body.data.status).not.toBe(PaymentScheduleStatus.SETTLED)

    const again = await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verificationId}/cancel`)
      .expect(400)

    expect(again.body.code).toBe(400)
  })

  it('rejects confirm-collection on cancelled schedule', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-关闭后核销` }))
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${created.body.data.id}/cancel`)
      .send({ cancelReason: '关闭测试' })
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
      .query({ paymentScheduleId: created.body.data.id, pageSize: 10 })
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
      .query({ paymentScheduleId: created.body.data.id, pageSize: 10 })
      .expect(200)

    const transactionId = verifications.body.data.items[0].transactionId
    const transaction = await authRequest(app, financeToken)
      .get(`/api/finance/transactions/${transactionId}`)
      .expect(200)

    expect(transaction.body.data.paymentChannel).toBe(PaymentChannel.ALIPAY)
    expect(transaction.body.data.direction).toBe('outflow')
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

    const list = await authRequest(app, financeToken)
      .get('/api/finance/transactions')
      .query({ departureId: otherDepartureId, pageSize: 50 })
      .expect(200)

    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1)
    expect(
      list.body.data.items.every(
        (item: { departureId: string | null }) => item.departureId === otherDepartureId,
      ),
    ).toBe(true)
  })

  it('creates transaction without departureId when paymentChannel is provided', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/finance/transactions')
      .send({
        direction: 'outflow',
        paymentChannel: PaymentChannel.CASH,
        amountCents: 8000,
        transactionDate: '2026-07-07',
        counterpartyType: CounterpartyType.manual,
        counterpartyName: '无发团流水',
      })
      .expect(201)

    expect(response.body.data.paymentChannel).toBe(PaymentChannel.CASH)
    expect(response.body.data.departureId).toBeNull()
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
          counterpartyType: CounterpartyType.manual,
          counterpartyId: undefined,
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
          counterpartyType: CounterpartyType.manual,
          counterpartyId: undefined,
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
          counterpartyType: CounterpartyType.manual,
          counterpartyId: undefined,
          counterpartyName: `${filterPrefix}-作废`,
        }),
      )
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/transactions/${voidTx.body.data.id}/void`)
      .send({})
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

  it('returns 403 for coordinator on GET /finance/receivables', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/finance/receivables')
      .expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for coordinator finance mutations', async () => {
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send(schedulePayload({ title: `${testPrefix}-权限测试` }))
      .expect(201)

    const confirm = await authRequest(app, coordinatorToken)
      .post(`/api/finance/receivables/${created.body.data.id}/confirm-collection`)
      .send(confirmPayload({ amountCents: 10000 }))
      .expect(403)

    expect(confirm.body.code).toBe(403)

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
      })
      .expect(403)

    expect(createTx.body.code).toBe(403)

    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ paymentScheduleId: created.body.data.id, pageSize: 10 })
      .expect(200)

    if (verifications.body.data.items.length > 0) {
      const cancel = await authRequest(app, coordinatorToken)
        .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
        .expect(403)

      expect(cancel.body.code).toBe(403)
    }
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
        .send({})
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
  })
})
