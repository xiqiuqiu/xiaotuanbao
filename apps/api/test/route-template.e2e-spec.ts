import type { INestApplication } from '@nestjs/common'
import { CounterpartyType, DepartureRouteSource, ResourceKind } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

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

  let templateSeq = 0

  async function createTemplate() {
    templateSeq += 1
    const response = await authRequest(app, coordinatorToken)
      .post('/api/route-templates')
      .send({
        name: `${testPrefix}-喀纳斯阿勒泰10日线-${templateSeq}`,
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

  it('deletes a used route template without affecting existing departure arrangement', async () => {
    const template = await createTemplate()

    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-after-delete`,
        routeName: `${testPrefix}-喀纳斯阿勒泰10日线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
        templateId: template.id,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string
    expect(createResponse.body.data.sourceTemplateId).toBe(template.id)

    const segmentsBefore = await prisma.itinerarySegment.findMany({
      where: { departureId },
      orderBy: { startDate: 'asc' },
    })
    expect(segmentsBefore).toHaveLength(2)

    const resourcesBefore = await prisma.segmentResource.findMany({
      where: { segmentId: { in: segmentsBefore.map((segment) => segment.id) } },
    })
    expect(resourcesBefore).toHaveLength(3)

    await authRequest(app, coordinatorToken)
      .delete(`/api/route-templates/${template.id}`)
      .expect(200)

    await authRequest(app, coordinatorToken)
      .get(`/api/route-templates/${template.id}`)
      .expect(404)

    const listResponse = await authRequest(app, coordinatorToken)
      .get('/api/route-templates')
      .query({ keyword: testPrefix })
      .expect(200)
    expect(
      (listResponse.body.data as Array<{ id: string }>).some((item) => item.id === template.id),
    ).toBe(false)

    const departure = await prisma.departure.findUnique({ where: { id: departureId } })
    expect(departure).toMatchObject({
      id: departureId,
      sourceTemplateId: template.id,
      routeSource: DepartureRouteSource.template,
    })

    const segmentsAfter = await prisma.itinerarySegment.findMany({
      where: { departureId },
      orderBy: { startDate: 'asc' },
    })
    expect(segmentsAfter).toHaveLength(2)
    expect(segmentsAfter.map((segment) => segment.name)).toEqual(['喀纳斯', '阿勒泰'])

    const resourcesAfter = await prisma.segmentResource.findMany({
      where: { segmentId: { in: segmentsAfter.map((segment) => segment.id) } },
    })
    expect(resourcesAfter).toHaveLength(3)
    expect(resourcesAfter.map((resource) => resource.title).sort()).toEqual(
      ['区间车', '喀纳斯酒店', '拼出接待'].sort(),
    )

    const templateRow = await prisma.routeTemplate.findUnique({ where: { id: template.id } })
    expect(templateRow).toBeNull()
  })

  it('rejects save-from-departure when departure has no segments', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-no-segments`,
        routeName: `${testPrefix}-空路线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `${testPrefix}-no-seg-template`,
        defaultDayCount: 10,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('行程段')
  })

  it('rejects save-from-departure when trimmed name already exists in organization', async () => {
    const existingName = `${testPrefix}-dup-name-target`
    await authRequest(app, coordinatorToken)
      .post('/api/route-templates')
      .send({
        name: existingName,
        defaultDayCount: 5,
        segments: [
          {
            sortOrder: 0,
            name: '段1',
            dayCount: 5,
          },
        ],
      })
      .expect(201)

    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-dup-name-src`,
        routeName: existingName,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '喀纳斯',
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `  ${existingName}  `,
        defaultDayCount: 10,
      })
      .expect(409)

    expect(String(response.body.message)).toMatch(/名称已存在|改名/)
  })

  it('saves template from departure with segments but no resources', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-seg-only`,
        routeName: `${testPrefix}-仅行程段`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '喀纳斯',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '阿勒泰',
        startDate: '2026-08-04',
        endDate: '2026-08-10',
        destination: '阿勒泰',
      })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `${testPrefix}-seg-only-template`,
        defaultDayCount: 10,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      name: `${testPrefix}-seg-only-template`,
      defaultDayCount: 10,
      segmentCount: 2,
      resourceCount: 0,
    })

    const templateId = response.body.data.id as string
    const templateResources = await prisma.routeTemplateResource.findMany({
      where: { templateSegment: { templateId } },
    })
    expect(templateResources).toHaveLength(0)
  })

  it('saves template from departure with resources forced to zero amounts', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-with-resource`,
        routeName: `${testPrefix}-有资源`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    const segmentResponse = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '喀纳斯',
      })
      .expect(201)

    const segmentId = segmentResponse.body.data.id as string

    await prisma.segmentResource.create({
      data: {
        segmentId,
        resourceKind: ResourceKind.hotel,
        counterpartyType: CounterpartyType.supplier,
        supplierId,
        title: '喀纳斯酒店',
        amountCents: 120000,
      },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `${testPrefix}-with-resource-template`,
        defaultDayCount: 10,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      segmentCount: 1,
      resourceCount: 1,
    })

    const templateId = response.body.data.id as string
    const templateResources = await prisma.routeTemplateResource.findMany({
      where: { templateSegment: { templateId } },
    })
    expect(templateResources).toHaveLength(1)
    expect(templateResources[0].amountCents).toBe(0)
    expect(templateResources[0].title).toBe('喀纳斯酒店')
  })

  it('returns 404 when deleting a route template from another organization', async () => {
    const template = await createTemplate()

    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-other`),
      },
    })

    try {
      await prisma.routeTemplate.update({
        where: { id: template.id },
        data: { organizationId: otherOrg.id },
      })

      await authRequest(app, coordinatorToken)
        .delete(`/api/route-templates/${template.id}`)
        .expect(404)

      const stillThere = await prisma.routeTemplate.findUnique({ where: { id: template.id } })
      expect(stillThere).not.toBeNull()
    } finally {
      await prisma.routeTemplateResource.deleteMany({
        where: { templateSegment: { templateId: template.id } },
      })
      await prisma.routeTemplateSegment.deleteMany({ where: { templateId: template.id } })
      await prisma.routeTemplate.deleteMany({ where: { id: template.id } })
      await prisma.organization.delete({ where: { id: otherOrg.id } })
    }
  })
})
