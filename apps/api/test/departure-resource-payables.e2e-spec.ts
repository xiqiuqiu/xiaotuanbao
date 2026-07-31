import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PaymentScheduleDirection,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { DepartureDataGapService } from '../src/modules/departure/departure-data-gap.service'
import { authRequest, AR_AP_SCHEDULE_NO_REGEX, createTestApp, loginAs } from './helpers'

describe('Departure resource CRUD and generate payables (e2e) (#205)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let supplierId: string
  const testPrefix = `e2e-dr-ap-${Date.now()}`

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

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-supplier`,
        categories: [
          ResourceKind.transport,
          ResourceKind.insurance,
          ResourceKind.guide,
          ResourceKind.hotel,
        ],
        status: DirectoryProfileStatus.active,
      },
    })
    supplierId = supplier.id
  })

  afterAll(async () => {
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.departureResource.deleteMany({
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

    return response.body.data as { id: string; payableCents?: number }
  }

  async function createDepartureResource(
    departureId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '全程用车',
        amountCents: 200000,
        ...overrides,
      })
      .expect(201)

    return response.body.data as {
      id: string
      departureId: string
      resourceKind: string
      amountCents: number
      counterpartyName: string
    }
  }

  it('creates transport, insurance, and guide departure resources', async () => {
    const departure = await createDeparture()

    const transport = await createDepartureResource(departure.id, {
      resourceKind: ResourceKind.transport,
      title: '全程用车',
      amountCents: 200000,
    })
    const insurance = await createDepartureResource(departure.id, {
      resourceKind: ResourceKind.insurance,
      title: '旅行社责任险',
      amountCents: 50000,
    })
    const guide = await createDepartureResource(departure.id, {
      resourceKind: ResourceKind.guide,
      title: '全程导游',
      amountCents: 150000,
    })

    expect(transport).toMatchObject({
      departureId: departure.id,
      resourceKind: ResourceKind.transport,
      counterpartyType: CounterpartyType.supplier,
      supplierId,
      payableStatus: 'not_generated',
    })
    expect(insurance.resourceKind).toBe(ResourceKind.insurance)
    expect(guide.resourceKind).toBe(ResourceKind.guide)

    const list = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/resources`)
      .expect(200)

    expect(list.body.data.total).toBe(3)
    expect(list.body.data.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [transport.id, insurance.id, guide.id].sort(),
    )
  })

  it('rejects resource kind outside supplier categories', async () => {
    const departure = await createDeparture()

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/resources`)
      .send({
        resourceKind: ResourceKind.meal,
        supplierId,
        title: '团餐',
        amountCents: 10000,
      })
      .expect(400)

    expect(response.body.message).toContain('不属于该供应商的类别集合')
  })

  it('generates one payable per departure resource', async () => {
    const departure = await createDeparture()
    const resource = await createDepartureResource(departure.id)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departure-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(response.body.data.sourceAmountMismatch).toBe(false)
    expect(response.body.data.schedule).toMatchObject({
      departureId: departure.id,
      sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
      sourceId: resource.id,
      amountCents: 200000,
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: supplierId,
      title: '全程用车',
    })
    expect(response.body.data.schedule.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    expect(response.body.data.resource).toMatchObject({
      hasPaymentSchedule: true,
      payableStatus: 'pending',
    })
  })

  it('rejects regenerate when an active payable already exists', async () => {
    const departure = await createDeparture()
    const resource = await createDepartureResource(departure.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/departure-resources/${resource.id}/generate-payable`)
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post(`/api/departure-resources/${resource.id}/generate-payable`)
      .expect(409)

    expect(second.body.message).toBe('当前资源已提交应付，不能再次提交')

    const count = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: resource.id,
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })
    expect(count).toBe(1)
  })

  it('voids an untouched departure-resource payable and allows regeneration', async () => {
    const departure = await createDeparture()
    const resource = await createDepartureResource(departure.id)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/departure-resources/${resource.id}/generate-payable`)
      .expect(201)

    const scheduleId = generated.body.data.schedule.id as string
    await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
      .send({ voidReason: '录错金额，作废重开' })
      .expect(201)

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/departure-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(regenerated.body.data.schedule.sourceType).toBe(
      PaymentScheduleSourceType.DEPARTURE_RESOURCE,
    )
    expect(regenerated.body.data.schedule.id).not.toBe(scheduleId)
  })

  it('updates and deletes a departure resource without payable', async () => {
    const departure = await createDeparture()
    const resource = await createDepartureResource(departure.id)

    const updated = await authRequest(app, coordinatorToken)
      .patch(`/api/departure-resources/${resource.id}`)
      .send({ title: '全程用车（修订）', amountCents: 210000 })
      .expect(200)

    expect(updated.body.data).toMatchObject({
      title: '全程用车（修订）',
      amountCents: 210000,
    })

    await authRequest(app, coordinatorToken)
      .delete(`/api/departure-resources/${resource.id}`)
      .expect(200)

    await authRequest(app, coordinatorToken)
      .get(`/api/departure-resources/${resource.id}`)
      .expect(404)
  })

  it('includes departure-level resource amounts in cost total with segment resources', async () => {
    const departure = await createDeparture()

    const segment = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '喀纳斯段',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        destination: '喀纳斯',
      })
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segment.body.data.id}/resources`)
      .send({
        resourceKind: ResourceKind.hotel,
        supplierId,
        title: '喀纳斯酒店',
        amountCents: 100000,
      })
      .expect(201)

    await createDepartureResource(departure.id, {
      resourceKind: ResourceKind.transport,
      title: '全程用车',
      amountCents: 200000,
    })

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}`)
      .expect(200)

    expect(detail.body.data.payableCents).toBe(300000)
  })

  it('does not flag no_segment_resources when only departure resources exist', async () => {
    const departure = await createDeparture()

    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '一日段',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      })
      .expect(201)

    await createDepartureResource(departure.id, {
      resourceKind: ResourceKind.insurance,
      title: '保险',
      amountCents: 30000,
    })

    // 对照：同组织下「有段无任何资源」仍应有缺口；本团因有发团级资源不应出现。
    const emptyDeparture = await createDeparture()
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${emptyDeparture.id}/segments`)
      .send({
        name: '空段',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      })
      .expect(201)

    const gapService = app.get(DepartureDataGapService)
    const gapsByDeparture = await gapService.findByOrganization(organizationId)
    const filledCodes = (gapsByDeparture.get(departure.id) ?? []).map((gap) => gap.code)
    const emptyCodes = (gapsByDeparture.get(emptyDeparture.id) ?? []).map((gap) => gap.code)

    expect(filledCodes).not.toContain('no_segment_resources')
    expect(emptyCodes).toContain('no_segment_resources')
  })
})
