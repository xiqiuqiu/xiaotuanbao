import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Partner outsource orders API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let otherPartnerId: string
  const testPrefix = `e2e-partner-oo-${Date.now()}`

  // 固定 fixtures：三张跨发团拼出资源（P1）＋干扰（P2 / 非拼出）
  // D1 出团 2026-06-10：拼出 2500.00（备注「整段」）＋ 同发团第二行 300.00
  // D2 出团 2026-07-05：拼出 4000.00
  // D3 出团 2026-05-20：拼出 600.00
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

  async function createOutsourceResource(
    segmentId: string,
    title: string,
    amountCents: number,
    notes: string | null = null,
    partner: string = partnerId,
  ) {
    await prisma.segmentResource.create({
      data: {
        segmentId,
        resourceKind: ResourceKind.outsource,
        counterpartyType: CounterpartyType.partner,
        partnerId: partner,
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

    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-partner`,
        partnerKind: PartnerKind.both,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const otherPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-partner-second`,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    otherPartnerId = otherPartner.id

    departure1 = await createDeparture(`${testPrefix}-d1`, '2026-06-10', '2026-06-14')
    departure2 = await createDeparture(`${testPrefix}-d2`, '2026-07-05', '2026-07-09')
    departure3 = await createDeparture(`${testPrefix}-d3`, '2026-05-20', '2026-05-24')

    const segment1 = await createSegment(departure1.id, '第一段', 0)
    const segment2 = await createSegment(departure2.id, '第一段', 0)
    const segment3 = await createSegment(departure3.id, '第一段', 0)

    await createOutsourceResource(segment1, '喀纳斯拼出', 250000, '整段')
    await createOutsourceResource(segment1, '喀纳斯加单拼出', 30000)
    await createOutsourceResource(segment2, '阿勒泰拼出', 400000)
    await createOutsourceResource(segment3, '布尔津拼出', 60000)

    // 干扰 1：同发团、另一 Partner 的拼出
    await createOutsourceResource(segment1, '别家拼出', 999900, null, otherPartnerId)
    // 干扰 2：同 Partner 但非拼出（不应出现；partnerId 偶发脏数据时仍按 kind 过滤）
    await prisma.segmentResource.create({
      data: {
        segmentId: segment1,
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.partner,
        partnerId,
        title: '误挂酒店',
        amountCents: 888800,
      },
    })
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
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  it('rejects users without /partner menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无合作伙伴权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const response = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/outsource-orders`)
      .expect(403)

    expect(response.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role to read the outsource order segment', async () => {
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/outsource-orders`)
      .expect(200)
  })

  it('returns 404 for unknown partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners/nonexistent-partner-id/outsource-orders')
      .expect(404)

    expect(response.body.message).toBe('合作伙伴不存在')
  })

  it('returns 404 for partner in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}`),
      },
    })
    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        partnerKind: PartnerKind.peer,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/outsource-orders`)
      .expect(404)

    expect(response.body.code).toBe(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists outsource rows across departures sorted by departure date desc', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/outsource-orders`)
      .expect(200)

    const data = response.body.data
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
      title: '阿勒泰拼出',
      amountCents: 400000,
    })
    expect(first).not.toHaveProperty('resourceKind')
    expect(first).not.toHaveProperty('payableStatus')

    const amounts = data.items.map((item: { amountCents: number }) => item.amountCents)
    expect(amounts).not.toContain(999900)
    expect(amounts).not.toContain(888800)
  })

  it('computes the three-metric summary following the whole filtered set', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/outsource-orders`)
      .expect(200)

    expect(response.body.data.summary).toEqual({
      resourceRowCount: 4,
      departureCount: 3,
      totalAmountCents: 740000,
    })
  })

  it('filters by departure date range and summary follows the filter', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/outsource-orders`)
      .query({ departureDateFrom: '2026-06-01', departureDateTo: '2026-06-30' })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(2)
    expect(data.summary).toEqual({
      resourceRowCount: 2,
      departureCount: 1,
      totalAmountCents: 280000,
    })
  })

  it('paginates items while summary keeps covering the whole filtered set', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/outsource-orders`)
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
