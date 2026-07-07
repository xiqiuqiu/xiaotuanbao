import type { INestApplication } from '@nestjs/common'
import { CounterpartyType, PaymentScheduleDirection } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentScheduleStatus } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

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
  const testPrefix = `e2e-finance-${Date.now()}`

  function schedulePayload(overrides: Record<string, unknown> = {}) {
    return {
      departureId,
      title: `${testPrefix}-节点`,
      amountCents: 50000,
      dueDate: '2026-12-31',
      counterpartyType: CounterpartyType.partner,
      counterpartyName: '测试旅行社',
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
  })

  afterAll(async () => {
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

    expect(response.body.data.scheduleNo).toMatch(/^AR\d{8}\d{4}$/)
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

    expect(response.body.data.scheduleNo).toMatch(/^AR\d{8}\d{4}$/)
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

    expect(response.body.data.scheduleNo).toMatch(/^AP\d{8}\d{4}$/)
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
      data: { name: `${testPrefix}-foreign-org` },
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
        scheduleNo: `AR202608019999`,
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
})
