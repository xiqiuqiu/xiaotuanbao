import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PaymentChannel, PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { authRequest, createTestApp, loginAs } from './helpers'

/**
 * ADR-0023 / #134: partner:write action key enforcement.
 * 计调 (wangjie) 与企业管理员 (admin) 持有 partner:write，可维护合作伙伴目录；
 * 财务 (acai) 不持有，对目录写接口（create/update/archive/restore）返回 403，
 * 但合作伙伴往来账款读取与账款操作走 /partner 与 /finance/*，财务仍可 200。
 */
describe('partner:write action-key enforcement (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let adminToken: string
  let organizationId: string
  let ownerUserId: string
  let ledgerPartnerId: string
  let partnerReceivableScheduleId: string
  const testPrefix = `e2e-partnerwrite-${Date.now()}`

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

    // 往来账款 fixtures：客户补款应收，供财务操作（登记收款）验证 200。
    const ledgerPartner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-往来伙伴`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    ledgerPartnerId = ledgerPartner.id

    const departure = await authRequest(app, coordinatorToken)
      .post('/api/departures')
      .send({
        name: `${testPrefix}-团`,
        routeName: '喀纳斯阿勒泰10日线',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId,
      })
      .expect(201)

    const sourceOrder = await authRequest(app, coordinatorToken)
      .post(`/api/departures/${departure.body.data.id as string}/source-orders`)
      .send({
        partnerId: ledgerPartnerId,
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.split,
        depositCents: 120000,
        balanceCents: 80000,
      })
      .expect(201)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.body.data.id as string}/generate-receivables`)
      .expect(201)
    const customerSchedule = generated.body.data.schedules.find(
      (schedule: { sourceType: string }) =>
        schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    ) as { id: string }
    partnerReceivableScheduleId = customerSchedule.id
  })

  afterAll(async () => {
    await prisma.financeVerification.deleteMany({
      where: {
        organizationId,
        paymentSchedule: { departure: { name: { startsWith: testPrefix } } },
      },
    })
    await prisma.financeTransaction.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.paymentSchedule.deleteMany({
      where: { organizationId, departure: { name: { startsWith: testPrefix } } },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { name: { startsWith: testPrefix } } },
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

  function partnerPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`,
      partnerKind: PartnerKind.group_agent,
      partnerType: PartnerType.group_agency,
      ...overrides,
    }
  }

  async function createPartner(token: string) {
    const response = await authRequest(app, token)
      .post('/api/partners')
      .send(partnerPayload())
      .expect(201)
    return response.body.data as { id: string }
  }

  describe('合作伙伴目录写接口 — 财务 403', () => {
    it('rejects 财务 creating a partner with 403', async () => {
      await authRequest(app, financeToken)
        .post('/api/partners')
        .send(partnerPayload())
        .expect(403)
    })

    it('rejects 财务 updating / archiving / restoring with 403', async () => {
      const partner = await createPartner(coordinatorToken)

      await authRequest(app, financeToken)
        .patch(`/api/partners/${partner.id}`)
        .send({ contactName: '财务改联系人' })
        .expect(403)
      await authRequest(app, financeToken)
        .post(`/api/partners/${partner.id}/archive`)
        .expect(403)

      // 归档后再验证财务恢复也被拒
      await authRequest(app, coordinatorToken)
        .post(`/api/partners/${partner.id}/archive`)
        .expect(201)
      await authRequest(app, financeToken)
        .post(`/api/partners/${partner.id}/restore`)
        .expect(403)
    })
  })

  describe('合作伙伴目录写接口 — 计调 / 企业管理员 200', () => {
    it('allows 计调 to create / update / archive / restore', async () => {
      const partner = await createPartner(coordinatorToken)
      await authRequest(app, coordinatorToken)
        .patch(`/api/partners/${partner.id}`)
        .send({ contactName: '计调改联系人' })
        .expect(200)
      await authRequest(app, coordinatorToken)
        .post(`/api/partners/${partner.id}/archive`)
        .expect(201)
      await authRequest(app, coordinatorToken)
        .post(`/api/partners/${partner.id}/restore`)
        .expect(201)
    })

    it('allows 企业管理员 to create / update / archive / restore', async () => {
      const partner = await createPartner(adminToken)
      await authRequest(app, adminToken)
        .patch(`/api/partners/${partner.id}`)
        .send({ contactName: '管理员改联系人' })
        .expect(200)
      await authRequest(app, adminToken)
        .post(`/api/partners/${partner.id}/archive`)
        .expect(201)
      await authRequest(app, adminToken)
        .post(`/api/partners/${partner.id}/restore`)
        .expect(201)
    })
  })

  describe('合作伙伴往来账款 — 财务照常 200', () => {
    it('lets 财务 read partner receivables/payables and register a collection', async () => {
      await authRequest(app, financeToken)
        .get(`/api/partners/${ledgerPartnerId}/receivables`)
        .expect(200)
      await authRequest(app, financeToken)
        .get(`/api/partners/${ledgerPartnerId}/payables`)
        .expect(200)

      // 登记收款是往来账款操作（走 /finance/receivable），财务仍可 200。
      await authRequest(app, financeToken)
        .post(`/api/finance/receivables/${partnerReceivableScheduleId}/confirm-collection`)
        .send({
          amountCents: 50000,
          transactionDate: '2026-08-15',
          paymentChannel: PaymentChannel.BANK_TRANSFER,
          counterpartyType: CounterpartyType.partner,
          counterpartyId: ledgerPartnerId,
          counterpartyName: `${testPrefix}-往来伙伴`,
        })
        .expect(201)
    })
  })
})
