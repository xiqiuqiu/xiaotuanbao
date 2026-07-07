import type { INestApplication } from '@nestjs/common'
import { DepartureStatus, DepartureType } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Departure API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  const testPrefix = `e2e-departure-${Date.now()}`

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
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        departureNo: { startsWith: testPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  function createPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `${testPrefix}-团`,
      routeName: '喀纳斯阿勒泰10日线',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId,
      ...overrides,
    }
  }

  it('returns 403 for finance role on GET /departures', async () => {
    const response = await authRequest(app, financeToken).get('/api/departures').expect(403)

    expect(response.body.code).toBe(403)
    expect(response.body.message).toBe('无权访问')
  })

  it('returns 403 for finance role on POST /departures', async () => {
    const response = await authRequest(app, financeToken)
      .post('/api/departures')
      .send(createPayload())
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('returns preview departure number for startDate', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/next-no')
      .query({ startDate: '2026-08-01' })
      .expect(200)

    expect(response.body.data.departureNo).toMatch(/^DT20260801\d{4}$/)
  })

  it('returns 403 for finance role on GET /departures/next-no', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/departures/next-no')
      .query({ startDate: '2026-08-01' })
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('creates departure with core fields', async () => {
    const departureNo = `${testPrefix}-001`

    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(
        createPayload({
          departureNo,
          name: `${testPrefix}-create`,
          departureType: DepartureType.independent,
          notes: '测试备注',
        }),
      )
      .expect(201)

    expect(response.body.data).toMatchObject({
      departureNo,
      name: `${testPrefix}-create`,
      routeName: '喀纳斯阿勒泰10日线',
      routeSource: 'manual',
      departureType: DepartureType.independent,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      dayCount: 10,
      ownerUserId,
      status: DepartureStatus.editing,
      notes: '测试备注',
    })
    expect(response.body.data.id).toBeTruthy()
    expect(response.body.data.departureProgress).toBeTruthy()
  })

  it('lists departures ordered by updatedAt desc', async () => {
    const firstNo = `${testPrefix}-list-a`
    const secondNo = `${testPrefix}-list-b`

    await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo: firstNo, name: `${testPrefix}-list-first` }))
      .expect(201)

    await new Promise((resolve) => setTimeout(resolve, 20))

    await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(
        createPayload({
          departureNo: secondNo,
          name: `${testPrefix}-list-second`,
          startDate: '2026-09-01',
          endDate: '2026-09-05',
        }),
      )
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({ keyword: `${testPrefix}-list`, pageSize: 50 })
      .expect(200)

    const items = response.body.data.items as Array<{ departureNo: string }>
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].departureNo).toBe(secondNo)
    expect(items[1].departureNo).toBe(firstNo)
  })

  it('returns 409 when departureNo duplicates in same organization', async () => {
    const departureNo = `${testPrefix}-dup`

    await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo, name: `${testPrefix}-dup-a` }))
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo, name: `${testPrefix}-dup-b` }))
      .expect(409)

    expect(response.body.code).toBe(409)
    expect(response.body.message).toBe('团号已存在')
  })

  it('does not list departures from another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: { name: `${testPrefix}-other-org` },
    })

    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-other-user`,
        passwordHash: 'unused',
        name: '其他企业用户',
      },
    })

    const foreignNo = `${testPrefix}-foreign`
    await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        departureNo: foreignNo,
        name: `${testPrefix}-foreign-name`,
        routeName: '外部路线',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-05T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId: otherUser.id,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({ keyword: foreignNo, pageSize: 50 })
      .expect(200)

    expect(response.body.data.items).toHaveLength(0)

    await prisma.departure.deleteMany({ where: { organizationId: otherOrg.id } })
    await prisma.user.delete({ where: { id: otherUser.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('filters departures by keyword and status', async () => {
    const departureNo = `${testPrefix}-filter`

    await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo, name: `${testPrefix}-filter-name` }))
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures')
      .query({
        keyword: `${testPrefix}-filter-name`,
        status: DepartureStatus.editing,
        startDateFrom: '2026-08-01',
        startDateTo: '2026-08-31',
        pageSize: 50,
      })
      .expect(200)

    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].departureNo).toBe(departureNo)
  })

  async function createTestDeparture(overrides: Record<string, unknown> = {}) {
    const departureNo = `${testPrefix}-detail-${Math.random().toString(36).slice(2, 8)}`
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send(createPayload({ departureNo, ...overrides }))
      .expect(201)

    return response.body.data as { id: string; departureNo: string }
  }

  it('returns 403 for finance role on GET /departures/:id', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}`)
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('returns departure detail for coordinator', async () => {
    const departure = await createTestDeparture({ name: `${testPrefix}-detail-get` })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: departure.id,
      departureNo: departure.departureNo,
      name: `${testPrefix}-detail-get`,
      status: DepartureStatus.editing,
      totalGuests: 0,
      netReceivableCents: 0,
      payableCents: 0,
    })
    expect(response.body.data.departureProgress).toBeTruthy()
  })

  it('updates departure core fields', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({
        name: `${testPrefix}-updated`,
        notes: '更新备注',
      })
      .expect(200)

    expect(response.body.data.name).toBe(`${testPrefix}-updated`)
    expect(response.body.data.notes).toBe('更新备注')
  })

  it('transitions editing to pending_settlement', async () => {
    const departure = await createTestDeparture()

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    expect(response.body.data.status).toBe(DepartureStatus.pending_settlement)
  })

  it('returns 400 for illegal transition pending_settlement to editing', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.editing })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('不允许的状态转换')
  })

  it('closes departure and rejects patch with 409', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .expect(201)

    const patchResponse = await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({ name: `${testPrefix}-closed-edit` })
      .expect(409)

    expect(patchResponse.body.code).toBe(409)
    expect(patchResponse.body.message).toBe('发团已关闭，不可编辑')
  })

  it('returns 400 when transitioning closed departure', async () => {
    const departure = await createTestDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/close`)
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/transition`)
      .send({ targetStatus: DepartureStatus.pending_settlement })
      .expect(400)

    expect(response.body.code).toBe(400)
    expect(response.body.message).toBe('已关闭发团不可变更状态')
  })
})
