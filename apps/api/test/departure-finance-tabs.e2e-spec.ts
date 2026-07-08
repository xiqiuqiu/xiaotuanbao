import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Departure finance tabs (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let adminToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  const testPrefix = `e2e-df-tab-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    adminToken = await loginAs(app, 'admin')
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
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.$disconnect()
    await app.close()
  })

  async function createDeparture(suffix = '') {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团${suffix}`,
        routeName: '测试路线',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        ownerUserId,
      })
      .expect(201)

    return response.body.data as { id: string }
  }

  async function createSourceOrder(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        guestCount: 10,
        unitPriceCents: 100000,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)

    return response.body.data as { id: string; displayName: string }
  }

  async function generateReceivables(sourceOrderId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrderId}/generate-receivables`)
      .expect(201)

    return response.body.data.schedules as Array<{ id: string; departureId: string }>
  }

  it('allows coordinator to list departure-scoped receivables', async () => {
    const departure = await createDeparture('-ar')
    const sourceOrder = await createSourceOrder(departure.id)
    const schedules = await generateReceivables(sourceOrder.id)

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)

    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0].id).toBe(schedules[0].id)
    expect(response.body.data.items[0].departureId).toBe(departure.id)
  })

  it('blocks coordinator from finance mutation APIs', async () => {
    const departure = await createDeparture('-mut')
    const sourceOrder = await createSourceOrder(departure.id)
    const schedules = await generateReceivables(sourceOrder.id)
    const scheduleId = schedules[0].id

    const forbidden = await authRequest(app, coordinatorToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-07-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(403)

    expect(forbidden.body.message).toBe('无权访问')
  })

  it('blocks coordinator from global finance list APIs', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/finance/receivables')
      .expect(403)

    expect(response.body.message).toBe('无权访问')
  })

  it('blocks finance role from departure detail API', async () => {
    const departure = await createDeparture('-fin')

    const response = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}`)
      .expect(403)

    expect(response.body.message).toBe('无权访问')
  })

  it('allows admin to list departure-scoped receivables and confirm collection', async () => {
    const departure = await createDeparture('-adm')
    const sourceOrder = await createSourceOrder(departure.id)
    const schedules = await generateReceivables(sourceOrder.id)
    const scheduleId = schedules[0].id

    const listResponse = await authRequest(app, adminToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)

    expect(listResponse.body.data.items).toHaveLength(1)

    const confirmResponse = await authRequest(app, adminToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-07-01',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(201)

    expect(confirmResponse.body.data.settledAmountCents).toBe(1000000)
  })

  it('isolates schedules by departure scope', async () => {
    const departureA = await createDeparture('-a')
    const departureB = await createDeparture('-b')

    const sourceOrderA = await createSourceOrder(departureA.id)
    await createSourceOrder(departureB.id)
    const schedulesA = await generateReceivables(sourceOrderA.id)

    const response = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departureA.id}/receivables`)
      .expect(200)

    expect(response.body.data.total).toBe(1)
    expect(response.body.data.items[0].id).toBe(schedulesA[0].id)
    expect(response.body.data.items[0].departureId).toBe(departureA.id)

    const otherDepartureSchedules = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        departureId: departureB.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
    })
    expect(otherDepartureSchedules).toBe(0)
  })

  it('returns empty payables and verifications for departure without data', async () => {
    const departure = await createDeparture('-empty')

    const payables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/payables`)
      .expect(200)

    const verifications = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/verifications`)
      .expect(200)

    expect(payables.body.data.total).toBe(0)
    expect(verifications.body.data.total).toBe(0)
  })

  it('returns 404 for non-existent departure finance endpoints', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/departures/non-existent-id/receivables')
      .expect(404)

    expect(response.body.message).toBe('发团不存在')
  })
})
