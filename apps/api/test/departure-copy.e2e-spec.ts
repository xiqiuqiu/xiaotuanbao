import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureRouteSource,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Departure copy & save template (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-departure-copy-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')

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
        categories: [ResourceKind.hotel],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, scheduleNo: { startsWith: testPrefix } },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: {
        sourceOrder: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
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
    await prisma.routeTemplateResource.deleteMany({
      where: {
        templateSegment: {
          template: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.routeTemplateSegment.deleteMany({
      where: {
        template: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.routeTemplate.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
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

  async function createRichDeparture(suffix: string) {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-rich-${suffix}`,
        routeName: `${testPrefix}-喀纳斯线`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    const segmentResponse = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯段',
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

    const sourceOrderResponse = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 8,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    const sourceOrderId = sourceOrderResponse.body.data.id as string

    await prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId,
        direction: PaymentScheduleDirection.receivable,
        scheduleNo: `${testPrefix}-schedule-${suffix}`,
        title: '测试应收',
        amountCents: 800000,
        dueDate: new Date('2026-08-01'),
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        sourceType: 'source_order',
        sourceId: sourceOrderId,
      },
    })

    return { departureId, segmentId, sourceOrderId }
  }

  it('saves route template from departure with structure and zero amounts', async () => {
    const { departureId } = await createRichDeparture('save-src')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `${testPrefix}-saved-route`,
        defaultDayCount: 10,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      name: `${testPrefix}-saved-route`,
      defaultDayCount: 10,
      segmentCount: 1,
      resourceCount: 1,
    })

    const templateId = response.body.data.id as string

    const templateSegments = await prisma.routeTemplateSegment.findMany({
      where: { templateId },
      include: { resources: true },
    })
    expect(templateSegments).toHaveLength(1)
    expect(templateSegments[0].name).toBe('喀纳斯段')
    expect(templateSegments[0].resources).toHaveLength(1)
    expect(templateSegments[0].resources[0].amountCents).toBe(0)
    expect(templateSegments[0].resources[0].title).toBe('喀纳斯酒店')

    const sourceDepartureSourceOrders = await prisma.sourceOrder.count({
      where: { departureId },
    })
    expect(sourceDepartureSourceOrders).toBe(1)

    const sourceDepartureSchedules = await prisma.paymentSchedule.count({
      where: { departureId },
    })
    expect(sourceDepartureSchedules).toBe(1)
  })

  it('rejects save-from-departure when copy flags are present', async () => {
    const { departureId } = await createRichDeparture('save-flags')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/route-templates/from-departure/${departureId}`)
      .send({
        name: `${testPrefix}-saved-flags`,
        defaultDayCount: 10,
        copySegments: true,
        copyResources: true,
        copyReferencePrices: true,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('copySegments')
    expect(String(response.body.message)).toContain('copyResources')
    expect(String(response.body.message)).toContain('copyReferencePrices')
  })

  it('copies departure with structure, zero amounts, and without finance', async () => {
    const { departureId } = await createRichDeparture('copy-src')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      routeSource: DepartureRouteSource.copy,
      sourceTemplateId: null,
      routeName: `${testPrefix}-喀纳斯线`,
    })
    expect(response.body.data.departureNo).toMatch(/^[A-Z]{2,4}\d{6}\d{4}$/)

    const copiedDepartureId = response.body.data.id as string

    const segmentsResponse = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/segments`)
      .expect(200)
    expect(segmentsResponse.body.data.items).toHaveLength(1)
    expect(segmentsResponse.body.data.items[0].name).toBe('喀纳斯段')
    expect(segmentsResponse.body.data.items[0]).not.toHaveProperty('fromTemplate')
    expect(segmentsResponse.body.data.items[0].pendingCheck).toBe(true)
    expect(segmentsResponse.body.data.items[0].startDate).toBe('2026-09-01')

    const segmentId = segmentsResponse.body.data.items[0].id as string
    const resourcesResponse = await authRequest(app, coordinatorToken)
      .get(`/api/segments/${segmentId}/resources`)
      .expect(200)
    expect(resourcesResponse.body.data.items).toHaveLength(1)
    expect(resourcesResponse.body.data.items[0]).not.toHaveProperty('fromTemplate')
    expect(resourcesResponse.body.data.items[0].pendingCheck).toBe(true)
    expect(resourcesResponse.body.data.items[0].amountCents).toBe(0)
    expect(resourcesResponse.body.data.items[0].title).toBe('喀纳斯酒店')

    const segments = await prisma.itinerarySegment.findMany({
      where: { departureId: copiedDepartureId },
      orderBy: { startDate: 'asc' },
    })
    expect(segments).toHaveLength(1)
    expect(segments[0]).not.toHaveProperty('fromTemplate')
    expect(segments[0].pendingCheck).toBe(true)

    const resources = await prisma.segmentResource.findMany({
      where: { segmentId: segments[0].id },
    })
    expect(resources).toHaveLength(1)
    expect(resources[0]).not.toHaveProperty('fromTemplate')
    expect(resources[0].pendingCheck).toBe(true)
    expect(resources[0].amountCents).toBe(0)

    const clearedSegment = await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${segmentId}`)
      .send({ name: '喀纳斯段' })
      .expect(200)
    expect(clearedSegment.body.data.pendingCheck).toBe(false)

    const resourceId = resourcesResponse.body.data.items[0].id as string
    const clearedResource = await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resourceId}`)
      .send({ title: '喀纳斯酒店' })
      .expect(200)
    expect(clearedResource.body.data.pendingCheck).toBe(false)

    const sourceOrders = await prisma.sourceOrder.count({
      where: { departureId: copiedDepartureId },
    })
    expect(sourceOrders).toBe(0)

    const paymentSchedules = await prisma.paymentSchedule.count({
      where: { departureId: copiedDepartureId },
    })
    expect(paymentSchedules).toBe(0)
  })

  it('rejects departure copy when copy flags are present', async () => {
    const { departureId } = await createRichDeparture('copy-flags')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied-flags`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
        copySegments: true,
        copyResources: true,
        copyReferencePrices: true,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('copySegments')
    expect(String(response.body.message)).toContain('copyResources')
    expect(String(response.body.message)).toContain('copyReferencePrices')
  })

  it('keeps copied departure unchanged after source segment rename', async () => {
    const { departureId, segmentId } = await createRichDeparture('detach-src')

    const copyResponse = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-detach-dst`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(201)

    const copiedDepartureId = copyResponse.body.data.id as string

    await prisma.itinerarySegment.update({
      where: { id: segmentId },
      data: { name: `${testPrefix}-renamed-segment` },
    })

    const copiedSegments = await prisma.itinerarySegment.findMany({
      where: { departureId: copiedDepartureId },
    })
    expect(copiedSegments[0].name).toBe('喀纳斯段')
  })
})
