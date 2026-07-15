import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

describe('Partner ledger receivables/payables API (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  let similarNamePartnerId: string
  let departureId: string
  const testPrefix = `e2e-partner-ledger-${Date.now()}`

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

    // P1 名称是 P2 名称的前缀：keyword 模糊匹配会互串，精确过滤不得互串
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id

    const similarNamePartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-华东国旅分社`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    similarNamePartnerId = similarNamePartner.id

    const departureResponse = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-d1`,
        routeName: '喀纳斯阿勒泰10日线',
        startDate: '2026-06-10',
        endDate: '2026-06-14',
        ownerUserId,
      })
      .expect(201)
    departureId = departureResponse.body.data.id as string

    // P1 客源单：split 模式 → 生成「客户补款」(counterparty=partner) + 「游客代收」(counterparty=guest) 两个应收节点
    const order1Response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 120000,
      })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order1Response.body.data.id}/generate-receivables`)
      .expect(201)

    // P2（同名前缀干扰）客源单：partner_settled → 生成 counterparty=P2 的应收节点
    const order2Response = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departureId}/source-orders`)
      .send({
        partnerId: similarNamePartnerId,
        adultGuestCount: 3,
        childGuestCount: 0,
        adultUnitPriceCents: 90000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.partner_settled,
      })
      .expect(201)
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${order2Response.body.data.id}/generate-receivables`)
      .expect(201)

    // 手工应付：P1 一张、P2 一张
    await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId,
        title: `${testPrefix}-p1-payable`,
        amountCents: 50000,
        dueDate: '2026-06-20',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
        counterpartyName: `${testPrefix}-华东国旅`,
      })
      .expect(201)
    await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId,
        title: `${testPrefix}-p2-payable`,
        amountCents: 70000,
        dueDate: '2026-06-21',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: similarNamePartnerId,
        counterpartyName: `${testPrefix}-华东国旅分社`,
      })
      .expect(201)
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: {
          departure: { organizationId, name: { startsWith: testPrefix } },
        },
      },
    })
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: {
        departure: { organizationId, name: { startsWith: testPrefix } },
      },
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

  it('rejects users without /partner menu permission', async () => {
    const { hash } = await import('bcryptjs')
    const password = 'admin123'
    const username = `${testPrefix}-noperm`
    const user = await prisma.user.create({
      data: {
        organizationId,
        username,
        passwordHash: await hash(password, 10),
        name: '无合作伙伴权限用户',
      },
    })

    const token = await loginAs(app, username, password)
    const receivablesResponse = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(403)
    expect(receivablesResponse.body.message).toBe('无权访问')

    const payablesResponse = await authRequest(app, token)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(403)
    expect(payablesResponse.body.message).toBe('无权访问')

    await prisma.user.delete({ where: { id: user.id } })
  })

  it('allows finance role under ADR-0016 early-launch menus', async () => {
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(200)
    await authRequest(app, financeToken)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(200)
  })

  it('returns 404 for unknown partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get('/api/partners/nonexistent-partner-id/receivables')
      .expect(404)

    expect(response.body.message).toBe('合作伙伴不存在')
  })

  it('returns 404 for partner in another organization', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(testPrefix),
      },
    })
    const foreignPartner = await prisma.partner.create({
      data: {
        organizationId: otherOrg.id,
        name: `${testPrefix}-foreign`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })

    await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/receivables`)
      .expect(404)
    await authRequest(app, coordinatorToken)
      .get(`/api/partners/${foreignPartner.id}/payables`)
      .expect(404)

    await prisma.partner.delete({ where: { id: foreignPartner.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('lists only receivables anchored to the exact partner, excluding guest-collection nodes', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .expect(200)

    const data = response.body.data
    // P1 split 客源单只产生 1 个 partner 应收（客户补款 1200）；游客代收节点（counterparty=guest）不出现
    expect(data.total).toBe(1)
    expect(data.items).toHaveLength(1)
    expect(data.items[0]).toMatchObject({
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      amountCents: 120000,
    })

    // 该客源单确实生成了游客代收节点，只是被精确过滤排除
    const guestSchedules = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        departureId,
        counterpartyType: CounterpartyType.guest,
      },
    })
    expect(guestSchedules.length).toBeGreaterThan(0)
  })

  it('does not leak nodes of a partner whose name contains the target partner name', async () => {
    const [p1Response, p2Response] = await Promise.all([
      authRequest(app, coordinatorToken)
        .get(`/api/partners/${partnerId}/receivables`)
        .expect(200),
      authRequest(app, coordinatorToken)
        .get(`/api/partners/${similarNamePartnerId}/receivables`)
        .expect(200),
    ])

    const p1Ids = p1Response.body.data.items.map(
      (item: { counterpartyId: string }) => item.counterpartyId,
    )
    const p2Ids = p2Response.body.data.items.map(
      (item: { counterpartyId: string }) => item.counterpartyId,
    )
    expect(p1Ids).toEqual([partnerId])
    expect(p2Ids).toEqual([similarNamePartnerId])
    expect(p2Response.body.data.items[0]).toMatchObject({ amountCents: 270000 })
  })

  it('lists only payables anchored to the exact partner', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/payables`)
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      amountCents: 50000,
      title: `${testPrefix}-p1-payable`,
    })
  })

  it('ignores counterparty overrides from the query string', async () => {
    const response = await authRequest(app, coordinatorToken)
      .get(`/api/partners/${partnerId}/receivables`)
      .query({ counterpartyId: similarNamePartnerId })
      .expect(200)

    const data = response.body.data
    expect(data.total).toBe(1)
    expect(data.items[0].counterpartyId).toBe(partnerId)
  })
})
