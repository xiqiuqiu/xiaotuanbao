import type { INestApplication } from '@nestjs/common'
import { DirectoryProfileStatus, ResourceKind } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Daily segment skeleton (e2e) #202', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  const testPrefix = `e2e-daily-seg-${Date.now()}`

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
        categories: [ResourceKind.transport, ResourceKind.hotel, ResourceKind.ticket],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
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
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture(overrides: Record<string, unknown> = {}) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '按日骨架线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        ...overrides,
      })
      .expect(201)

    return response.body.data as { id: string; startDate: string; endDate: string; dayCount: number }
  }

  async function listSegments(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departureId}/segments`)
      .expect(200)
    return response.body.data as {
      items: Array<{
        id: string
        name: string
        startDate: string | null
        endDate: string | null
        dayCount: number | null
        resourceCount: number
      }>
      total: number
    }
  }

  function generateDaily(
    departureId: string,
    body: Record<string, unknown> = {},
    token = coordinatorToken,
  ) {
    return authRequest(app, token)
      .post(`/api/departures/${departureId}/segments/generate-daily`)
      .send(body)
  }

  it('generates N one-day segments for an N-day departure', async () => {
    const departure = await createDeparture({
      name: `${testPrefix}-10日`,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    })

    const response = await generateDaily(departure.id).expect(201)

    expect(response.body.data).toMatchObject({
      mode: 'fill_missing',
      dayCount: 10,
      createdCount: 10,
      removedCount: 0,
    })

    const listed = await listSegments(departure.id)
    expect(listed.total).toBe(10)
    expect(listed.items).toHaveLength(10)
    expect(listed.items.map((item) => [item.startDate, item.endDate, item.dayCount])).toEqual([
      ['2026-08-01', '2026-08-01', 1],
      ['2026-08-02', '2026-08-02', 1],
      ['2026-08-03', '2026-08-03', 1],
      ['2026-08-04', '2026-08-04', 1],
      ['2026-08-05', '2026-08-05', 1],
      ['2026-08-06', '2026-08-06', 1],
      ['2026-08-07', '2026-08-07', 1],
      ['2026-08-08', '2026-08-08', 1],
      ['2026-08-09', '2026-08-09', 1],
      ['2026-08-10', '2026-08-10', 1],
    ])
  })

  it('allows CRUD after daily skeleton generation', async () => {
    const departure = await createDeparture({
      name: `${testPrefix}-crud`,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    })

    await generateDaily(departure.id).expect(201)
    const before = await listSegments(departure.id)
    const mid = before.items.find((item) => item.startDate === '2026-09-02')
    expect(mid).toBeTruthy()

    await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${mid!.id}`)
      .send({ name: '中日改名', destination: '布尔津' })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '加一段',
        startDate: '2026-09-03',
        endDate: '2026-09-03',
      })
      .expect(201)

    await authRequest(app, coordinatorToken).delete(`/api/segments/${mid!.id}`).expect(200)

    const after = await listSegments(departure.id)
    expect(after.items.some((item) => item.name === '中日改名')).toBe(false)
    expect(after.items.some((item) => item.name === '加一段')).toBe(true)
  })

  it('fill_missing only adds uncovered days and never overwrites resource-bearing segments', async () => {
    const departure = await createDeparture({
      name: `${testPrefix}-fill`,
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    })

    const existing = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '跨日有资源',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/segments/${existing.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.hotel,
        supplierId,
        title: '酒店',
        amountCents: 10000,
      })
      .expect(201)

    const response = await generateDaily(departure.id, { mode: 'fill_missing' }).expect(201)
    expect(response.body.data).toMatchObject({
      mode: 'fill_missing',
      createdCount: 1,
      removedCount: 0,
      preservedWithResources: 1,
    })

    const listed = await listSegments(departure.id)
    expect(listed.total).toBe(2)
    const kept = listed.items.find((item) => item.id === existing.body.data.id)
    expect(kept).toMatchObject({
      name: '跨日有资源',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      resourceCount: 1,
    })
    expect(listed.items.some((item) => item.startDate === '2026-10-03' && item.endDate === '2026-10-03')).toBe(
      true,
    )
  })

  it('rebuild_empty removes empty segments then regenerates missing days; keeps resource segments', async () => {
    const departure = await createDeparture({
      name: `${testPrefix}-rebuild`,
      startDate: '2026-11-01',
      endDate: '2026-11-03',
    })

    await generateDaily(departure.id).expect(201)
    const firstPass = await listSegments(departure.id)
    const day1 = firstPass.items.find((item) => item.startDate === '2026-11-01')
    const day2 = firstPass.items.find((item) => item.startDate === '2026-11-02')
    expect(day1 && day2).toBeTruthy()

    await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${day1!.id}`)
      .send({ name: '有资源的第1天' })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/segments/${day1!.id}/resources`)
      .send({
        resourceKind: ResourceKind.ticket,
        supplierId,
        title: '门票',
        amountCents: 5000,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${day2!.id}`)
      .send({ name: '空段改名应被重建清掉' })
      .expect(200)

    const response = await generateDaily(departure.id, { mode: 'rebuild_empty' }).expect(201)
    expect(response.body.data).toMatchObject({
      mode: 'rebuild_empty',
      removedCount: 2,
      createdCount: 2,
      preservedWithResources: 1,
    })

    const listed = await listSegments(departure.id)
    expect(listed.total).toBe(3)
    expect(listed.items.find((item) => item.id === day1!.id)).toMatchObject({
      name: '有资源的第1天',
      resourceCount: 1,
    })
    expect(listed.items.some((item) => item.name === '空段改名应被重建清掉')).toBe(false)
    expect(
      listed.items.filter((item) => item.startDate === item.endDate && item.dayCount === 1),
    ).toHaveLength(3)
  })

  it('date change does not silently delete resource-bearing segments; fill_missing can extend', async () => {
    const departure = await createDeparture({
      name: `${testPrefix}-reschedule`,
      startDate: '2026-12-01',
      endDate: '2026-12-02',
    })

    await generateDaily(departure.id).expect(201)
    const before = await listSegments(departure.id)
    const day1 = before.items.find((item) => item.startDate === '2026-12-01')
    expect(day1).toBeTruthy()

    await authRequest(app, coordinatorToken)
      .post(`/api/segments/${day1!.id}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '用车',
        amountCents: 8000,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departure.id}`)
      .send({ startDate: '2026-12-01', endDate: '2026-12-04' })
      .expect(200)

    const afterDateChange = await listSegments(departure.id)
    expect(afterDateChange.items.find((item) => item.id === day1!.id)).toMatchObject({
      resourceCount: 1,
      startDate: '2026-12-01',
    })
    expect(afterDateChange.total).toBe(2)

    const fill = await generateDaily(departure.id, { mode: 'fill_missing' }).expect(201)
    expect(fill.body.data.createdCount).toBe(2)

    const afterFill = await listSegments(departure.id)
    expect(afterFill.total).toBe(4)
    expect(afterFill.items.find((item) => item.id === day1!.id)?.resourceCount).toBe(1)
  })

  it('forbids finance role from generating daily segments (departure:write)', async () => {
    const departure = await createDeparture({ name: `${testPrefix}-finance` })
    await generateDaily(departure.id, {}, financeToken).expect(403)
  })
})
