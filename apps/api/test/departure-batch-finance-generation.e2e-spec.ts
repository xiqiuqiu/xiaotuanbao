import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Departure batch finance generation (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-batch-fin-${Date.now()}`

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
        categories: [ResourceKind.transport],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.financeTransaction.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
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
    await prisma.supplier.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '测试路线',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        ownerUserId,
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  async function createSourceOrder(
    departureId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 500000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        discountCents: 0,
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 300000,
        ...overrides,
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  async function createSegment(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯段',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        destination: '喀纳斯',
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  async function createResource(
    segmentId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segmentId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '喀纳斯用车',
        amountCents: 160000,
        ...overrides,
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  it('batch generates receivables for not_generated source orders only', async () => {
    const departure = await createDeparture()
    const pending = await createSourceOrder(departure.id)
    const already = await createSourceOrder(departure.id, {
      adultGuestCount: 1,
      adultUnitPriceCents: 400000,
      partnerCollectedCents: 0,
      collectionMode: SourceOrderCollectionMode.partner_settled,
    })
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${already.id}/generate-receivables`)
      .expect(201)

    const zeroAmount = await createSourceOrder(departure.id, {
      adultGuestCount: 1,
      adultUnitPriceCents: 0,
      childUnitPriceCents: 0,
      partnerCollectedCents: 0,
      collectionMode: SourceOrderCollectionMode.guest_only,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data).toMatchObject({
      attempted: 2,
      succeeded: 1,
      skipped: 1,
      failed: 0,
    })

    const byId = Object.fromEntries(
      response.body.data.items.map(
        (item: { sourceId: string; outcome: string; reason?: string }) => [
          item.sourceId,
          item,
        ],
      ),
    )
    expect(byId[pending.id]).toMatchObject({ outcome: 'succeeded' })
    expect(byId[zeroAmount.id]).toMatchObject({
      outcome: 'skipped',
      reason: '无可生成金额',
    })
    expect(byId[already.id]).toBeUndefined()

    const second = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/generate-receivables`)
      .expect(201)

    expect(second.body.data).toMatchObject({
      attempted: 1,
      succeeded: 0,
      skipped: 1,
      failed: 0,
    })
    expect(second.body.data.items[0]).toMatchObject({
      sourceId: zeroAmount.id,
      outcome: 'skipped',
    })
  })

  it('batch generates payables for one segment only', async () => {
    const departure = await createDeparture()
    const segmentA = await createSegment(departure.id)
    const segmentB = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '伊犁段',
        startDate: '2026-07-04',
        endDate: '2026-07-05',
        destination: '伊犁',
      })
      .expect(201)

    const pendingA = await createResource(segmentA.id, { title: '段A用车' })
    const zero = await prisma.segmentResource.create({
      data: {
        segmentId: segmentA.id,
        resourceKind: ResourceKind.transport,
        counterpartyType: CounterpartyType.supplier,
        supplierId,
        title: '占位资源',
        amountCents: 0,
      },
    })
    const pendingB = await createResource(segmentB.body.data.id, {
      title: '段B用车',
      amountCents: 200000,
    })
    const already = await createResource(segmentA.id, {
      title: '已生成',
      amountCents: 100000,
    })
    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${already.id}/generate-payable`)
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segmentA.id}/generate-payables`)
      .expect(201)

    expect(response.body.data).toMatchObject({
      attempted: 2,
      succeeded: 1,
      skipped: 1,
      failed: 0,
    })

    const byId = Object.fromEntries(
      response.body.data.items.map(
        (item: { sourceId: string; outcome: string; reason?: string }) => [
          item.sourceId,
          item,
        ],
      ),
    )
    expect(byId[pendingA.id]).toMatchObject({ outcome: 'succeeded' })
    expect(byId[zero.id]).toMatchObject({
      outcome: 'skipped',
      reason: '资源金额须大于 0 才能生成应付',
    })
    expect(byId[already.id]).toBeUndefined()
    expect(byId[pendingB.id]).toBeUndefined()

    const schedulesB = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: pendingB.id,
        direction: 'payable',
      },
    })
    expect(schedulesB).toBe(0)
  })

  it('rejects batch generation when departure is closed', async () => {
    const departure = await createDeparture()
    await createSourceOrder(departure.id)

    await prisma.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.closed },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/generate-receivables`)
      .expect(409)

    expect(response.body.message).toBe('发团已关闭，不可生成应收')
  })

  it('exposes payableGeneratedCount on segment list', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    await createResource(segment.id, { title: '未生成用车' })
    const generated = await createResource(segment.id, {
      title: '已生成用车',
      amountCents: 100000,
    })
    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${generated.id}/generate-payable`)
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/segments`)
      .expect(200)

    const item = (response.body.data.items as Array<{
      id: string
      resourceCount: number
      payableGeneratedCount: number
      payableStatus: string
    }>).find((row) => row.id === segment.id)

    expect(item).toMatchObject({
      id: segment.id,
      resourceCount: 2,
      payableGeneratedCount: 1,
      payableStatus: 'partial',
    })
  })

  it('rejects segment batch payables when departure is closed', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    await createResource(segment.id)

    await prisma.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.closed },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.id}/generate-payables`)
      .expect(409)

    expect(response.body.message).toBe('发团已关闭，不可生成应付')
  })

  it('does not expose departure-level generate-payables', async () => {
    const departure = await createDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/generate-payables`)
      .expect(404)
  })
})
