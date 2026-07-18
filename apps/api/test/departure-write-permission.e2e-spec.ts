import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  ResourceKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * ADR-0023 / #133: departure:write action key enforcement.
 * 计调 (wangjie) 与企业管理员 (admin) 持有 departure:write，可写；财务 (acai) 不持有，
 * 对发团/客源/执行/资源/常用路线的写接口返回 403；但生成应收/应付挂在 /departure，财务仍可 200。
 */
describe('departure:write action-key enforcement (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let supplierId: string
  const testPrefix = `e2e-depwrite-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = new PrismaClient()
    coordinatorToken = await loginAs(app, 'wangjie')
    financeToken = await loginAs(app, 'acai')
    adminToken = await loginAs(app, 'admin')

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
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.sourceOrderGuest.deleteMany({
      where: { sourceOrder: { departure: { name: { startsWith: testPrefix } } } },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.segmentResource.deleteMany({
      where: { segment: { departure: { name: { startsWith: testPrefix } } } },
    })
    await prisma.itinerarySegment.deleteMany({
      where: { departure: { name: { startsWith: testPrefix } } },
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

  function departurePayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `${testPrefix}-团`,
      routeName: '喀纳斯阿勒泰10日线',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId,
      ...overrides,
    }
  }

  async function createDeparture(token: string) {
    const response = await authRequest(app, token)
      .post('/api/departures')
      .send(departurePayload())
      .expect(201)
    return response.body.data as { id: string; departureNo: string }
  }

  async function createSourceOrder(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function createSegment(departureId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/segments`)
      .send({
        name: '喀纳斯段',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        destination: '喀纳斯',
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  async function createResource(segmentId: string) {
    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segments/${segmentId}/resources`)
      .send({
        resourceKind: ResourceKind.transport,
        supplierId,
        title: '喀纳斯用车',
        amountCents: 100000,
      })
      .expect(201)
    return response.body.data as { id: string }
  }

  describe('发团 create/update/transition/close — 财务 403，计调/管理员 200', () => {
    it('rejects 财务 creating a departure with 403', async () => {
      await authRequest(app, financeToken)
        .post('/api/departures')
        .send(departurePayload())
        .expect(403)
    })

    it('allows 计调 and 企业管理员 to create a departure', async () => {
      await createDeparture(coordinatorToken)
      await createDeparture(adminToken)
    })

    it('rejects 财务 copy / updating / transitioning / closing with 403', async () => {
      const departure = await createDeparture(coordinatorToken)

      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/copy`)
        .send({ name: `${testPrefix}-财务复制` })
        .expect(403)
      await authRequest(app, financeToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ routeName: '财务改路线' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: 'pending_settlement' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '财务尝试关闭' })
        .expect(403)
    })

    it('allows 计调 to update a departure', async () => {
      const departure = await createDeparture(coordinatorToken)
      await authRequest(app, coordinatorToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ routeName: '计调改路线' })
        .expect(200)
    })

    it('allows 企业管理员 to update / transition / close a departure', async () => {
      const departure = await createDeparture(adminToken)
      await authRequest(app, adminToken)
        .patch(`/api/departures/${departure.id}`)
        .send({ routeName: '管理员改路线' })
        .expect(200)
      await authRequest(app, adminToken)
        .post(`/api/departures/${departure.id}/transition`)
        .send({ targetStatus: 'pending_settlement' })
        .expect(201)
      await authRequest(app, adminToken)
        .post(`/api/departures/${departure.id}/close`)
        .send({ reason: '管理员关闭' })
        .expect(201)
    })
  })

  describe('客源单 / 客人名单 — 财务 403，计调 200', () => {
    it('rejects 财务 create/update/delete of source orders and guests', async () => {
      const departure = await createDeparture(coordinatorToken)
      const sourceOrder = await createSourceOrder(departure.id)

      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/source-orders`)
        .send({
          partnerId,
          adultGuestCount: 2,
          childGuestCount: 0,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 0,
          discountType: SourceOrderDiscountType.none,
          collectionMode: SourceOrderCollectionMode.guest_only,
        })
        .expect(403)
      await authRequest(app, financeToken)
        .patch(`/api/source-orders/${sourceOrder.id}`)
        .send({ adultGuestCount: 5 })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/source-orders/${sourceOrder.id}/guests`)
        .send({ name: '张三' })
        .expect(403)

      const guest = await authRequest(app, coordinatorToken)
        .post(`/api/source-orders/${sourceOrder.id}/guests`)
        .send({ name: '李四' })
        .expect(201)
      await authRequest(app, financeToken)
        .patch(`/api/source-orders/${sourceOrder.id}/guests/${guest.body.data.id as string}`)
        .send({ name: '财务改客人' })
        .expect(403)
      await authRequest(app, financeToken)
        .delete(`/api/source-orders/${sourceOrder.id}/guests/${guest.body.data.id as string}`)
        .expect(403)

      await authRequest(app, financeToken)
        .delete(`/api/source-orders/${sourceOrder.id}`)
        .expect(403)
    })

    it('allows 计调 to update a source order', async () => {
      const departure = await createDeparture(coordinatorToken)
      const sourceOrder = await createSourceOrder(departure.id)
      await authRequest(app, coordinatorToken)
        .patch(`/api/source-orders/${sourceOrder.id}`)
        .send({ adultGuestCount: 8 })
        .expect(200)
    })
  })

  describe('行程段 / 段资源 — 财务 403，计调 200', () => {
    it('rejects 财务 create/update/delete of segments and resources', async () => {
      const departure = await createDeparture(coordinatorToken)
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id)

      await authRequest(app, financeToken)
        .post(`/api/departures/${departure.id}/segments`)
        .send({ name: '财务加段', startDate: '2026-08-04', endDate: '2026-08-05' })
        .expect(403)
      await authRequest(app, financeToken)
        .patch(`/api/segments/${segment.id}`)
        .send({ name: '财务改段' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/segments/${segment.id}/resources`)
        .send({ resourceKind: ResourceKind.transport, supplierId, title: '财务加资源', amountCents: 1000 })
        .expect(403)
      await authRequest(app, financeToken)
        .patch(`/api/segment-resources/${resource.id}`)
        .send({ title: '财务改资源' })
        .expect(403)
      await authRequest(app, financeToken)
        .delete(`/api/segment-resources/${resource.id}`)
        .expect(403)
      await authRequest(app, financeToken)
        .delete(`/api/segments/${segment.id}`)
        .expect(403)
    })

    it('allows 计调 to update a segment resource', async () => {
      const departure = await createDeparture(coordinatorToken)
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id)
      await authRequest(app, coordinatorToken)
        .patch(`/api/segment-resources/${resource.id}`)
        .send({ title: '计调改资源' })
        .expect(200)
    })
  })

  describe('常用路线 — 财务 403，计调 200', () => {
    it('rejects 财务 create / from-departure', async () => {
      const departure = await createDeparture(coordinatorToken)

      await authRequest(app, financeToken)
        .post('/api/route-templates')
        .send({ name: `${testPrefix}-模板`, routeName: '财务建模板' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/route-templates/from-departure/${departure.id}`)
        .send({ name: `${testPrefix}-模板2` })
        .expect(403)
    })

    it('allows 计调 to save a departure as a route template but rejects 财务 delete', async () => {
      const departure = await createDeparture(coordinatorToken)
      const segment = await createSegment(departure.id)
      await createResource(segment.id)
      const template = await authRequest(app, coordinatorToken)
        .post(`/api/route-templates/from-departure/${departure.id}`)
        .send({ name: `${testPrefix}-模板计调`, defaultDayCount: 3 })
        .expect(201)

      await authRequest(app, financeToken)
        .delete(`/api/route-templates/${template.body.data.id as string}`)
        .expect(403)
    })
  })

  describe('资源应付作废 — 财务 403，计调 200', () => {
    it('rejects 财务 voiding a resource payable, allows 计调', async () => {
      const departure = await createDeparture(coordinatorToken)
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id)
      const generated = await authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`)
        .expect(201)
      const scheduleId = generated.body.data.schedule.id as string

      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
        .send({ voidReason: '财务尝试作废' })
        .expect(403)

      await authRequest(app, coordinatorToken)
        .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
        .send({ voidReason: '计调纠错作废' })
        .expect(201)
    })
  })

  describe('生成应收/应付挂在 /departure — 财务仍可 200', () => {
    it('lets 财务 generate receivables from a source order and a departure', async () => {
      const departure = await createDeparture(coordinatorToken)
      const sourceOrder = await createSourceOrder(departure.id)

      await authRequest(app, financeToken)
        .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
        .expect(201)

      const departure2 = await createDeparture(coordinatorToken)
      await createSourceOrder(departure2.id)
      await authRequest(app, financeToken)
        .post(`/api/departures/${departure2.id}/generate-receivables`)
        .expect(201)
    })

    it('lets 财务 generate payables from a resource and a segment', async () => {
      const departure = await createDeparture(coordinatorToken)
      const segment = await createSegment(departure.id)
      const resource = await createResource(segment.id)

      await authRequest(app, financeToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`)
        .expect(201)

      const segment2 = await createSegment(departure.id)
      await createResource(segment2.id)
      await authRequest(app, financeToken)
        .post(`/api/segments/${segment2.id}/generate-payables`)
        .expect(201)
    })
  })
})
