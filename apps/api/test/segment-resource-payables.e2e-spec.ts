import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  ResourceKind,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { authRequest, AR_AP_SCHEDULE_NO_REGEX, createTestApp, loginAs } from './helpers'

describe('Segment resource generate payables (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-sr-ap-${Date.now()}`

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
        verifications: {
          some: {
            paymentSchedule: {
              departure: { name: { startsWith: testPrefix } },
            },
          },
        },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
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
        notes: '7月1-3日',
        ...overrides,
      })
      .expect(201)

    return response.body.data as { id: string; counterpartyName: string }
  }

  it('creates one payable per supplier resource', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(response.body.data.sourceAmountMismatch).toBe(false)
    expect(response.body.data.schedule).toMatchObject({
      departureId: departure.id,
      sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
      sourceId: resource.id,
      amountCents: 160000,
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: supplierId,
      title: '喀纳斯用车',
    })
    expect(response.body.data.schedule.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)

    expect(response.body.data.resource).toMatchObject({
      hasPaymentSchedule: true,
      payableStatus: 'pending',
    })
  })

  it('uses Partner counterparty for outsource resources', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id, {
      resourceKind: ResourceKind.outsource,
      partnerId,
      supplierId: undefined,
      title: '阿勒泰拼出',
      amountCents: 800000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(response.body.data.schedule).toMatchObject({
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      amountCents: 800000,
      title: '阿勒泰拼出',
    })
  })

  it('is idempotent when generating payables twice', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const count = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: resource.id,
        direction: PaymentScheduleDirection.payable,
        cancelledAt: null,
      },
    })
    expect(count).toBe(1)
  })

  it('syncs schedule amount when resource is patched before finance touch', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resource.id}`)
      .send({ amountCents: 200000 })
      .expect(200)

    expect(patched.body.data.amountCents).toBe(200000)
    expect(patched.body.data.hasSourceAmountMismatch).toBe(false)

    const schedule = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resource.id,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        cancelledAt: null,
      },
    })

    expect(schedule?.amountCents).toBe(200000)
  })

  it('blocks amount patch after finance touch and flags mismatch on regenerate', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const scheduleId = generated.body.data.schedule.id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${scheduleId}/confirm-payment`)
      .send({
        amountCents: 160000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resource.id}`)
      .send({ amountCents: 150000 })
      .expect(400)

    expect(blocked.body.message).toBe('当前资源已发生付款，不允许修改金额')

    await prisma.segmentResource.update({
      where: { id: resource.id },
      data: { amountCents: 150000 },
    })

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(regenerated.body.data.sourceAmountMismatch).toBe(true)
    expect(regenerated.body.data.schedule.amountCents).toBe(160000)

    const fetched = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)

    expect(fetched.body.data.hasSourceAmountMismatch).toBe(true)
    expect(fetched.body.data.amountFieldsLocked).toBe(true)
  })

  it('rejects delete when resource has an active payable schedule', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const response = await authRequest(app, coordinatorToken)
      .delete(`/api/segment-resources/${resource.id}`)
      .expect(409)

    expect(response.body.message).toBe('当前资源已生成应付，不能直接删除')
  })

  it('allows coordinator to generate payables but not create finance payables directly', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const forbidden = await authRequest(app, coordinatorToken)
      .post('/api/finance/payables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-manual`,
        amountCents: 10000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(403)

    expect(forbidden.body.message).toBe('无权访问')
  })

  it('rejects generate payable when departure is closed', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await prisma.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.closed },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(409)

    expect(response.body.message).toBe('发团已关闭，不可生成应付')
  })
})
