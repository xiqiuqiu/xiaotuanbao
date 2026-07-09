import type { INestApplication } from '@nestjs/common'
import { CounterpartyType, DepartureRouteSource, ResourceKind } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Route Template API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-route-template-${Date.now()}`

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

    const partner = await prisma.partner.findFirst({
      where: { organizationId },
    })
    if (!partner) {
      throw new Error('Seed partner not found')
    }
    partnerId = partner.id

    const supplier = await prisma.supplier.findFirst({
      where: { organizationId },
    })
    if (!supplier) {
      throw new Error('Seed supplier not found')
    }
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.segmentResource.deleteMany({
      where: {
        segment: {
          departure: {
            organizationId,
            name: { startsWith: testPrefix },
          },
        },
      },
    })
    await prisma.itinerarySegment.deleteMany({
      where: {
        departure: {
          organizationId,
          name: { startsWith: testPrefix },
        },
      },
    })
    await prisma.departure.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPrefix },
      },
    })
    await prisma.routeTemplateResource.deleteMany({
      where: {
        templateSegment: {
          template: {
            organizationId,
            name: { startsWith: testPrefix },
          },
        },
      },
    })
    await prisma.routeTemplateSegment.deleteMany({
      where: {
        template: {
          organizationId,
          name: { startsWith: testPrefix },
        },
      },
    })
    await prisma.routeTemplate.deleteMany({
      where: {
        organizationId,
        name: { startsWith: testPrefix },
      },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createTemplate() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/route-templates')
      .send({
        name: `${testPrefix}-喀纳斯阿勒泰10日线`,
        defaultDayCount: 10,
        segments: [
          {
            sortOrder: 0,
            name: '喀纳斯',
            dayCount: 3,
            destination: '喀纳斯',
            resources: [
              {
                resourceKind: ResourceKind.hotel,
                counterpartyType: CounterpartyType.supplier,
                supplierId,
                title: '喀纳斯酒店',
                amountCents: 120000,
              },
              {
                resourceKind: ResourceKind.outsource,
                counterpartyType: CounterpartyType.partner,
                partnerId,
                title: '拼出接待',
                amountCents: 80000,
              },
            ],
          },
          {
            sortOrder: 1,
            name: '阿勒泰',
            dayCount: 7,
            destination: '阿勒泰',
            resources: [
              {
                resourceKind: ResourceKind.transport,
                counterpartyType: CounterpartyType.supplier,
                supplierId,
                title: '区间车',
                amountCents: 50000,
              },
            ],
          },
        ],
      })
      .expect(201)

    return response.body.data as { id: string; usageCount: number }
  }

  it('returns 403 for finance role on GET /route-templates', async () => {
    const response = await authRequest(app, financeToken)
      .get('/api/route-templates')
      .expect(403)

    expect(response.body.code).toBe(403)
  })

  it('creates departure from template with structure and zero resource amounts', async () => {
    const template = await createTemplate()
    expect(template.usageCount).toBe(0)

    const templateResources = await prisma.routeTemplateResource.findMany({
      where: {
        templateSegment: { templateId: template.id },
      },
    })
    expect(templateResources).toHaveLength(3)
    expect(templateResources.every((resource) => resource.amountCents === 0)).toBe(true)

    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: `${testPrefix}-喀纳斯阿勒泰10日线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        templateId: template.id,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      routeSource: DepartureRouteSource.template,
      sourceTemplateId: template.id,
    })

    const departureId = response.body.data.id as string

    const segments = await prisma.itinerarySegment.findMany({
      where: { departureId },
      orderBy: { startDate: 'asc' },
    })
    expect(segments).toHaveLength(2)
    expect(segments[0].name).toBe('喀纳斯')
    expect(segments[0].startDate.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(segments[0].endDate.toISOString().slice(0, 10)).toBe('2026-08-03')
    expect(segments[1].name).toBe('阿勒泰')
    expect(segments[1].startDate.toISOString().slice(0, 10)).toBe('2026-08-04')
    expect(segments[1].endDate.toISOString().slice(0, 10)).toBe('2026-08-10')

    const resources = await prisma.segmentResource.findMany({
      where: { segmentId: { in: segments.map((segment) => segment.id) } },
    })
    expect(resources).toHaveLength(3)
    expect(resources.every((resource) => resource.amountCents === 0)).toBe(true)
    expect(resources.map((resource) => resource.title).sort()).toEqual(
      ['区间车', '喀纳斯酒店', '拼出接待'].sort(),
    )

    const paymentSchedules = await prisma.paymentSchedule.count({
      where: { departureId },
    })
    expect(paymentSchedules).toBe(0)

    const updatedTemplate = await prisma.routeTemplate.findUnique({
      where: { id: template.id },
    })
    expect(updatedTemplate?.usageCount).toBe(1)
  })

  it('rejects create-from-template when copy flags are present', async () => {
    const template = await createTemplate()
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-flags-rejected`,
        routeName: `${testPrefix}-喀纳斯阿勒泰10日线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        templateId: template.id,
        copySegments: true,
        copyResources: true,
        copyReferencePrices: true,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('copySegments')
    expect(String(response.body.message)).toContain('copyResources')
    expect(String(response.body.message)).toContain('copyReferencePrices')
  })

  it('keeps departure segments unchanged after template segment rename', async () => {
    const template = await createTemplate()
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-detach`,
        routeName: `${testPrefix}-喀纳斯阿勒泰10日线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        templateId: template.id,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    const templateSegment = await prisma.routeTemplateSegment.findFirst({
      where: {
        templateId: template.id,
        sortOrder: 0,
      },
    })
    if (!templateSegment) {
      throw new Error('Template segment not found')
    }

    await prisma.routeTemplateSegment.update({
      where: { id: templateSegment.id },
      data: { name: `${testPrefix}-renamed-segment` },
    })

    const segments = await prisma.itinerarySegment.findMany({
      where: { departureId },
      orderBy: { startDate: 'asc' },
    })
    expect(segments[0].name).toBe('喀纳斯')
  })

  it('returns template detail with segment and resource counts', async () => {
    const template = await createTemplate()

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/route-templates/${template.id}`)
      .expect(200)

    expect(response.body.data).toMatchObject({
      id: template.id,
      segmentCount: 2,
      resourceCount: 3,
    })
  })
})
