import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

describe('Ticket type headcount soft check (e2e) #203', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  const testPrefix = `e2e-ticket-hc-${Date.now()}`

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
  })

  afterAll(async () => {
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
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

  async function createDeparture() {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '票型线',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        ownerUserId,
      })
      .expect(201)
    const departure = response.body.data as { id: string; totalGuests: number }
    await prisma.itinerarySegment.deleteMany({ where: { departureId: departure.id } })
    return departure
  }

  async function createSourceOrder(departureId: string, adultGuestCount: number, childGuestCount = 0) {
    await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount,
        childGuestCount,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: childGuestCount > 0 ? 50000 : 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)
  }

  it('reads and writes non-negative ticket type headcounts on a segment', async () => {
    const departure = await createDeparture()
    await createSourceOrder(departure.id, 8, 2)

    const created = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '第1天',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        fullTicketCount: 8,
        halfTicketCount: 1,
        studentTicketCount: 1,
        freeTicketCount: 0,
      })
      .expect(201)

    expect(created.body.data).toMatchObject({
      fullTicketCount: 8,
      halfTicketCount: 1,
      studentTicketCount: 1,
      freeTicketCount: 0,
      hasTicketHeadcountMismatch: false,
    })

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${created.body.data.id}`)
      .send({
        fullTicketCount: 7,
        halfTicketCount: 2,
        studentTicketCount: 0,
        freeTicketCount: 1,
      })
      .expect(200)

    expect(patched.body.data).toMatchObject({
      fullTicketCount: 7,
      halfTicketCount: 2,
      studentTicketCount: 0,
      freeTicketCount: 1,
    })

    const listed = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/segments`)
      .expect(200)

    expect(listed.body.data.items[0]).toMatchObject({
      fullTicketCount: 7,
      halfTicketCount: 2,
      studentTicketCount: 0,
      freeTicketCount: 1,
    })
  })

  it('soft-checks mismatch against source-order guest total: flags warning but still saves', async () => {
    const departure = await createDeparture()
    await createSourceOrder(departure.id, 8, 2)

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '第2天',
        startDate: '2026-08-02',
        endDate: '2026-08-02',
        fullTicketCount: 6,
        halfTicketCount: 1,
        studentTicketCount: 0,
        freeTicketCount: 0,
      })
      .expect(201)

    expect(response.body.data).toMatchObject({
      fullTicketCount: 6,
      halfTicketCount: 1,
      studentTicketCount: 0,
      freeTicketCount: 0,
      hasTicketHeadcountMismatch: true,
    })

    const stored = await prisma.itinerarySegment.findUniqueOrThrow({
      where: { id: response.body.data.id },
    })
    expect(stored).toMatchObject({
      fullTicketCount: 6,
      halfTicketCount: 1,
      studentTicketCount: 0,
      freeTicketCount: 0,
    })

    const matched = await authRequest(app, coordinatorToken)
      .patch(`/api/segments/${response.body.data.id}`)
      .send({
        fullTicketCount: 8,
        halfTicketCount: 1,
        studentTicketCount: 1,
        freeTicketCount: 0,
      })
      .expect(200)

    expect(matched.body.data.hasTicketHeadcountMismatch).toBe(false)
  })

  it('rejects negative ticket type headcounts', async () => {
    const departure = await createDeparture()

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.id}/segments`)
      .send({
        name: '非法票型',
        fullTicketCount: -1,
      })
      .expect(400)

    expect(String(response.body.message)).toMatch(/全|票型|非负|0/)
  })
})
