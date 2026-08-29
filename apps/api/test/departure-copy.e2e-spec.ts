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
import { authRequest, createTestApp, DEPARTURE_NO_REGEX, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Departure copy & save template (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  let transportSupplierId: string
  let guideSupplierId: string
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

    const transportSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-transport`,
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    transportSupplierId = transportSupplier.id

    const guideSupplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-guide`,
        categories: [ResourceKind.guide],
        status: DirectoryProfileStatus.active,
      },
    })
    guideSupplierId = guideSupplier.id
  })

  afterAll(async () => {
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, scheduleNo: { startsWith: testPrefix } },
    })
    await prisma.departureMaterial.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.storedObject.deleteMany({
      where: { organizationId, originalFilename: { startsWith: testPrefix } },
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
    await prisma.departureResource.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
    })
    await prisma.departureIncomeRecord.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
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
    const leftoverOrgs = await prisma.organization.findMany({
      where: { name: { startsWith: testPrefix } },
      select: { id: true },
    })
    if (leftoverOrgs.length > 0) {
      const leftoverIds = leftoverOrgs.map((org) => org.id)
      await prisma.departure.deleteMany({ where: { organizationId: { in: leftoverIds } } })
      await prisma.user.deleteMany({ where: { organizationId: { in: leftoverIds } } })
      await prisma.organization.deleteMany({ where: { id: { in: leftoverIds } } })
    }
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
        departureType: 'independent',
        notes: '源团基础备注',
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    await prisma.itinerarySegment.deleteMany({ where: { departureId } })

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

    await prisma.itinerarySegment.update({
      where: { id: segmentId },
      data: {
        fullTicketCount: 8,
        halfTicketCount: 2,
      },
    })

    await authRequest(app, coordinatorToken)
      .patch(`/api/departures/${departureId}`)
      .send({
        driverSupplierId: transportSupplierId,
        guideSupplierId,
        vehiclePlate: '新A·20601',
        contactPhone: '13800138000',
      })
      .expect(200)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId: transportSupplierId,
        title: '全程用车',
        amountCents: 200000,
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/income-records`)
      .send({
        type: 'coach_sales',
        projectName: '车销干果',
        amountCents: 12000,
      })
      .expect(201)

    const storedObject = await prisma.storedObject.create({
      data: {
        organizationId,
        objectKey: `orgs/${organizationId}/${testPrefix}-${suffix}-attachment`,
        originalFilename: `${testPrefix}-${suffix}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 4,
        createdByUserId: ownerUserId,
      },
    })
    await prisma.departureMaterial.create({
      data: {
        organizationId,
        departureId,
        storedObjectId: storedObject.id,
        originalFilename: `${testPrefix}-${suffix}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 4,
        sha256: `${testPrefix}-${suffix}-sha256`,
        contentDigest: `${testPrefix}-${suffix}-digest`,
        createdByUserId: ownerUserId,
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

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/guests`)
      .send({ name: '张三', phone: '13800000000', gender: 'male' })
      .expect(201)

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
      departureType: 'independent',
      notes: '源团基础备注',
      status: 'editing',
      sourceOrderCount: 0,
    })
    expect(response.body.data.departureNo).toMatch(DEPARTURE_NO_REGEX)

    const copiedDepartureId = response.body.data.id as string
    const copiedRow = await prisma.departure.findUnique({ where: { id: copiedDepartureId } })
    expect(copiedRow?.organizationId).toBe(organizationId)

    const copiedDetail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}`)
      .expect(200)
    expect(copiedDetail.body.data).toMatchObject({
      driverSupplierId: null,
      guideSupplierId: null,
      vehiclePlate: null,
      contactPhone: null,
      status: 'editing',
    })

    const segmentsResponse = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/segments`)
      .expect(200)
    // Copied 3-day segment + fill_missing for the remaining 7 days of the new window.
    expect(segmentsResponse.body.data.items).toHaveLength(8)
    const copiedSegment = segmentsResponse.body.data.items.find(
      (item: { name: string }) => item.name === '喀纳斯段',
    )
    expect(copiedSegment).toBeTruthy()
    expect(copiedSegment).toMatchObject({
      name: '喀纳斯段',
      pendingCheck: true,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      dayCount: 3,
    })
    expect(copiedSegment).not.toHaveProperty('fromTemplate')
    expect(
      segmentsResponse.body.data.items.every(
        (item: { startDate: string | null; endDate: string | null }) =>
          !item.startDate ||
          (item.startDate >= '2026-09-01' && (item.endDate ?? item.startDate) <= '2026-09-10'),
      ),
    ).toBe(true)

    const segmentId = copiedSegment!.id as string
    const resourcesResponse = await authRequest(app, coordinatorToken)
      .get(`/api/segments/${segmentId}/resources`)
      .expect(200)
    expect(resourcesResponse.body.data.items).toHaveLength(1)
    expect(resourcesResponse.body.data.items[0]).not.toHaveProperty('fromTemplate')
    expect(resourcesResponse.body.data.items[0].pendingCheck).toBe(true)
    expect(resourcesResponse.body.data.items[0].amountCents).toBe(0)
    expect(resourcesResponse.body.data.items[0].title).toBe('喀纳斯酒店')
    expect(resourcesResponse.body.data.items[0].resourceKind).toBe(ResourceKind.hotel)
    expect(resourcesResponse.body.data.items[0].supplierId).toBeNull()
    expect(resourcesResponse.body.data.items[0].partnerId).toBeNull()

    const segments = await prisma.itinerarySegment.findMany({
      where: { departureId: copiedDepartureId },
      orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
    })
    expect(segments).toHaveLength(8)
    const dbCopied = segments.find((segment) => segment.name === '喀纳斯段')
    expect(dbCopied).toBeTruthy()
    expect(dbCopied).not.toHaveProperty('fromTemplate')
    expect(dbCopied!.pendingCheck).toBe(true)
    expect(dbCopied!.fullTicketCount).toBe(0)
    expect(dbCopied!.halfTicketCount).toBe(0)

    const resources = await prisma.segmentResource.findMany({
      where: { segmentId: dbCopied!.id },
    })
    expect(resources).toHaveLength(1)
    expect(resources[0]).not.toHaveProperty('fromTemplate')
    expect(resources[0].pendingCheck).toBe(true)
    expect(resources[0].amountCents).toBe(0)
    expect(resources[0].supplierId).toBeNull()
    expect(resources[0].partnerId).toBeNull()
    expect(resources[0].resourceKind).toBe(ResourceKind.hotel)

    const clearedSegment = await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${segmentId}`)
      .send({ name: '喀纳斯段' })
      .expect(200)
    // 段字段已清 pendingCheck，但资源仍待检查 → 列表/详情展示层仍为 true
    expect(clearedSegment.body.data.pendingCheck).toBe(true)
    const dbSegmentAfterSave = await prisma.itinerarySegment.findUnique({
      where: { id: segmentId },
    })
    expect(dbSegmentAfterSave!.pendingCheck).toBe(false)

    const resourceId = resourcesResponse.body.data.items[0].id as string
    const clearedResource = await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resourceId}`)
      .send({ title: '喀纳斯酒店', supplierId })
      .expect(200)
    expect(clearedResource.body.data.pendingCheck).toBe(false)
    expect(clearedResource.body.data.supplierId).toBe(supplierId)

    const segmentsAfterResourceSave = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/segments`)
      .expect(200)
    const segmentAfterResourceSave = segmentsAfterResourceSave.body.data.items.find(
      (item: { id: string }) => item.id === dbCopied!.id,
    )
    expect(segmentAfterResourceSave.pendingCheck).toBe(false)

    const sourceOrders = await prisma.sourceOrder.count({
      where: { departureId: copiedDepartureId },
    })
    expect(sourceOrders).toBe(0)

    const guests = await prisma.sourceOrderGuest.count({
      where: { sourceOrder: { departureId: copiedDepartureId } },
    })
    expect(guests).toBe(0)

    const paymentSchedules = await prisma.paymentSchedule.count({
      where: { departureId: copiedDepartureId },
    })
    expect(paymentSchedules).toBe(0)

    const departureResources = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/resources`)
      .expect(200)
    expect(departureResources.body.data.items).toHaveLength(0)

    const incomeRecords = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/income-records`)
      .expect(200)
    expect(incomeRecords.body.data.items).toHaveLength(0)

    const attachments = await prisma.departureMaterial.count({
      where: { departureId: copiedDepartureId },
    })
    expect(attachments).toBe(0)
  })

  it('copies departure including segments with unset dates', async () => {
    const createResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-undated-src`,
        routeName: `${testPrefix}-未定日期复制`,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const departureId = createResponse.body.data.id as string

    await prisma.itinerarySegment.deleteMany({ where: { departureId } })

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '有日期段',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({ name: '未定日期段' })
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-undated-copied`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(201)

    const copiedDepartureId = response.body.data.id as string
    const segmentsResponse = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${copiedDepartureId}/segments`)
      .expect(200)

    // Copied dated + undated segments, plus fill_missing for uncovered days (Sep 4–10).
    expect(segmentsResponse.body.data.items).toHaveLength(9)
    expect(
      segmentsResponse.body.data.items.find((item: { name: string }) => item.name === '有日期段'),
    ).toMatchObject({
      name: '有日期段',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      dayCount: 3,
    })
    expect(
      segmentsResponse.body.data.items.find((item: { name: string }) => item.name === '未定日期段'),
    ).toMatchObject({
      name: '未定日期段',
      startDate: null,
      endDate: null,
      dayCount: null,
    })
  })

  it('allows copied base notes to be explicitly cleared', async () => {
    const { departureId } = await createRichDeparture('copy-clear-notes')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied-clear-notes`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
        notes: null,
      })
      .expect(201)

    expect(response.body.data.notes).toBeNull()
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

  it('rejects copy when the allocated itinerary overflows the new tour period', async () => {
    const { departureId } = await createRichDeparture('copy-overflow')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied-overflow`,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        ownerUserId,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('复制被拒绝')
    expect(String(response.body.message)).toContain('2026-09-01～2026-09-02')
    expect(response.body.data).toMatchObject({
      code: 'ITINERARY_SEGMENT_OUT_OF_RANGE',
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-02',
    })

    const leaked = await prisma.departure.findFirst({
      where: { organizationId, name: `${testPrefix}-copied-overflow` },
    })
    expect(leaked).toBeNull()
  })

  it('rejects copy when startDate is a full ISO datetime instead of YYYY-MM-DD', async () => {
    const { departureId } = await createRichDeparture('copy-date-only')

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied-datetime`,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('YYYY-MM-DD')
  })

  it.each([
    ['2026-02-30', '2026-03-10'],
    ['2026-13-01', '2026-13-10'],
  ])('rejects copy when the tour period contains an invalid calendar date (%s)', async (startDate, endDate) => {
    const { departureId } = await createRichDeparture(`copy-invalid-date-${startDate}`)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/copy`)
      .send({
        name: `${testPrefix}-copied-invalid-date-${startDate}`,
        startDate,
        endDate,
        ownerUserId,
      })
      .expect(400)

    expect(String(response.body.message)).toContain('YYYY-MM-DD')
  })

  it('returns 404 when copying a departure from another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`copy${Math.random().toString(36)}xyz`),
      },
    })
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        username: `${testPrefix}-other-user`,
        passwordHash: 'unused',
        name: '其他企业用户',
      },
    })
    const foreign = await prisma.departure.create({
      data: {
        organizationId: otherOrg.id,
        departureNo: `${testPrefix}-foreign`,
        name: `${testPrefix}-foreign-name`,
        routeName: '外部路线',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-03T00:00:00.000Z'),
        dayCount: 3,
        ownerUserId: otherUser.id,
      },
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${foreign.id}/copy`)
      .send({
        name: `${testPrefix}-copied-foreign`,
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        ownerUserId,
      })
      .expect(404)

    await prisma.departure.delete({ where: { id: foreign.id } })
    await prisma.user.delete({ where: { id: otherUser.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
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
    expect(copiedSegments.some((segment) => segment.name === '喀纳斯段')).toBe(true)
    expect(
      copiedSegments.every((segment) => segment.name !== `${testPrefix}-renamed-segment`),
    ).toBe(true)
  })
})
