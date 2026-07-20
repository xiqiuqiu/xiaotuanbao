import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Supplier service orders API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  let otherSupplierId: string
  const testPrefix = `e2e-supplier-svo-${Date.now()}`

  // 固定 fixtures（引用 S1 的非拼出资源行，跨三个发团）：
  // D1 出团 2026-06-10：酒店 2500.00（备注「窗口位」）＋ 餐 300.00（同发团两行，验证发团去重）
  // D2 出团 2026-07-05：导游 4000.00
  // D3 出团 2026-05-20：门票 600.00
  // 干扰：D1 另一供应商 S2 资源 9999.00；D1 一条 supplierId=S1 但 resourceKind=outsource（应被排除）
  let departure1: { id: string; departureNo: string }
  let departure2: { id: string; departureNo: string }
  let departure3: { id: string; departureNo: string }

  async function createDeparture(name: string, startDate: string, endDate: string) {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name,
        routeName: '喀纳斯阿勒泰10日线',
        startDate,
        endDate,
        ownerUserId,
      })
      .expect(201)
    return response.body.data as { id: string; departureNo: string }
  }

  async function createSegment(departureId: string, name: string, sortOrder: number) {
    const segment = await prisma.itinerarySegment.create({
      data: { departureId, name, sortOrder },
    })
    return segment.id
  }

  async function createSupplierResource(
    segmentId: string,
    resourceKind: ResourceKind,
    title: string,
    amountCents: number,
    notes: string | null = null,
    supplier: string = supplierId,
  ) {
    await prisma.segmentResource.create({
      data: {
        segmentId,
        resourceKind,
        counterpartyType: CounterpartyType.supplier,
        supplierId: supplier,
        title,
        amountCents,
        notes,
      },
    })
  }

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
        categories: [ResourceKind.hotel, ResourceKind.guide, ResourceKind.ticket, ResourceKind.meal],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id

    const otherSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-supplier-second`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    otherSupplierId = otherSupplier.id

    departure1 = await createDeparture(`${testPrefix}-d1`, '2026-06-10', '2026-06-14')
    departure2 = await createDeparture(`${testPrefix}-d2`, '2026-07-05', '2026-07-09')
    departure3 = await createDeparture(`${testPrefix}-d3`, '2026-05-20', '2026-05-24')

    const segment1 = await createSegment(departure1.id, '第一段', 0)
    const segment2 = await createSegment(departure2.id, '第一段', 0)
    const segment3 = await createSegment(departure3.id, '第一段', 0)

    await createSupplierResource(segment1, ResourceKind.hotel, '双床房', 250000, '窗口位')
    await createSupplierResource(segment1, ResourceKind.meal, '团餐', 30000)
    await createSupplierResource(segment2, ResourceKind.guide, '全程导游', 400000)
    await createSupplierResource(segment3, ResourceKind.ticket, '景区门票', 60000)

    // 干扰 1：同发团、另一供应商 —— 不得混入
    await createSupplierResource(
      segment1,
      ResourceKind.hotel,
      '别家酒店',
      999900,
      null,
      otherSupplierId,
    )
    // 干扰 2：supplierId=S1 但拼出 —— 按 resourceKind != outsource 过滤应被排除
    await createSupplierResource(segment1, ResourceKind.outsource, '拼出团位', 888800)
  })

  afterAll(async () => {
    await prisma.segmentResource.deleteMany({
      where: {
        segment: { departure: { organizationId, name: { startsWith: testPrefix } } },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
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

  it('rejects users without /supplier menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无供应商权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const response = await authRequest(app, token)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .expect(403)

    expect(response.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role to read the service order tab', async () => {
    await authRequest(app, financeToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .expect(200)
  })

  it('returns 404 for unknown supplier', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/suppliers/nonexistent-supplier-id/service-orders')
      .expect(404)

    expect(response.body.message).toBe('供应商不存在')
  })

  it('returns 404 for supplier in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}`),
      },
    })
    const foreignSupplier = await prisma.supplier.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${foreignSupplier.id}/service-orders`)
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.supplier.delete({ where: { id: foreignSupplier.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists supplier resource rows across departures sorted by departure date desc', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .expect(200)

    const data = response.body.data
    // 仅 S1 的非拼出行：4 行；排除另一供应商与拼出行
    expect(data.total).toBe(4)
    expect(data.items).toHaveLength(4)
    expect(
      data.items.map((item: { departureStartDate: string }) => item.departureStartDate),
    ).toEqual(['2026-07-05', '2026-06-10', '2026-06-10', '2026-05-20'])

    const first = data.items[0]
    expect(first).toMatchObject({
      departureId: departure2.id,
      departureNo: departure2.departureNo,
      departureName: `${testPrefix}-d2`,
      routeName: '喀纳斯阿勒泰10日线',
      segmentName: '第一段',
      resourceKind: ResourceKind.guide,
      title: '全程导游',
      amountCents: 400000,
    })

    // 另一供应商与拼出行的金额均不得出现
    const amounts = data.items.map((item: { amountCents: number }) => item.amountCents)
    expect(amounts).not.toContain(999900)
    expect(amounts).not.toContain(888800)
    // 不渗透财务处置字段
    expect(first).not.toHaveProperty('payableStatus')
  })

  it('computes the three-metric summary following the whole filtered set', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .expect(200)

    expect(response.body.data.summary).toEqual({
      resourceRowCount: 4,
      departureCount: 3,
      totalAmountCents: 740000,
    })
  })

  it('filters by departure date range and summary follows the filter', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(2)
    expect(
      data.items.map((item: { departureId: string }) => item.departureId),
    ).toEqual([departure1.id, departure1.id])
    expect(data.summary).toEqual({
      resourceRowCount: 2,
      departureCount: 1,
      totalAmountCents: 280000,
    })
  })

  it('includes boundary dates in the range filter', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .query({ departureDateFrom: '2026-05-20', departureDateTo: '2026-07-05' })
      .expect(200)

    expect(response.body.data.total).toBe(4)
  })

  it('supports open-ended range (only departureDateFrom)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .query({ departureDateFrom: '2026-07-01' })
      .expect(200)

    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].departureStartDate).toBe('2026-07-05')
  })

  it('returns 400 when range is invalid (from after to)', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .query({ departureDateFrom: '2026-07-01', departureDateTo: '2026-06-01' })
      .expect(400)

    expect(response.body.code).toBe(400)
  })

  it('paginates items while summary keeps covering the whole filtered set', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/suppliers/${supplierId}/service-orders`)
      .query({ page: 2, pageSize: 2 })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(4)
    expect(data.page).toBe(2)
    expect(data.pageSize).toBe(2)
    expect(data.items).toHaveLength(2)
    expect(data.summary).toEqual({
      resourceRowCount: 4,
      departureCount: 3,
      totalAmountCents: 740000,
    })
  })
})
