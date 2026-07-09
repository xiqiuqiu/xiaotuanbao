import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PaymentScheduleDirection,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { PaymentChannel, PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { authRequest, AR_AP_SCHEDULE_NO_REGEX, createTestApp, loginAs } from './helpers'

describe('Source order generate receivables (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let coordinatorToken: string
  let financeToken: string
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  const testPrefix = `e2e-so-ar-${Date.now()}`

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
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: SourceOrderDiscountType.none,
        collectionMode: SourceOrderCollectionMode.guest_only,
        ...overrides,
      })
      .expect(201)

    return response.body.data as { id: string; displayName: string }
  }

  it('creates dual-path receivables for split collection mode', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(2)
    expect(response.body.data.sourceAmountMismatch).toBe(false)

    const sourceTypes = response.body.data.schedules.map(
      (item: { sourceType: string }) => item.sourceType,
    )
    expect(sourceTypes).toEqual(
      expect.arrayContaining([
        PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      ]),
    )

    for (const schedule of response.body.data.schedules) {
      expect(schedule.departureId).toBe(departure.id)
      expect(schedule.sourceId).toBe(sourceOrder.id)
      expect(schedule.scheduleNo).toMatch(AR_AP_SCHEDULE_NO_REGEX)
    }

    const customerSchedule = response.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    const guestSchedule = response.body.data.schedules.find(
      (item: { sourceType: string }) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    expect(customerSchedule).toMatchObject({
      title: '客户补款',
      amountCents: 300000,
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
    })
    expect(guestSchedule).toMatchObject({
      title: '游客代收',
      amountCents: 700000,
      counterpartyType: CounterpartyType.guest,
      counterpartyName: sourceOrder.displayName,
    })

    expect(response.body.data.sourceOrder).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'pending',
    })
  })

  it('creates only guest collection schedule for guest_only mode', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(1)
    expect(response.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      amountCents: 1000000,
      title: '游客代收',
    })
  })

  it('creates only customer settlement schedule for partner_settled mode', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.partner_settled,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(1)
    expect(response.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: 1000000,
      title: '客户补款',
      counterpartyId: partnerId,
    })
  })

  it('is idempotent when generating receivables twice', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 200000,
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(second.body.data.schedules).toHaveLength(2)

    const count = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
    })
    expect(count).toBe(2)
  })

  it('syncs schedule amounts when source order is patched before finance touch', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({ partnerCollectedCents: 400000 })
      .expect(200)

    expect(patched.body.data.partnerCollectedCents).toBe(400000)
    expect(patched.body.data.guestCollectCents).toBe(600000)
    expect(patched.body.data.hasSourceAmountMismatch).toBe(false)

    const customerSchedule = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        cancelledAt: null,
      },
    })
    const guestSchedule = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
        cancelledAt: null,
      },
    })

    expect(customerSchedule?.amountCents).toBe(400000)
    expect(guestSchedule?.amountCents).toBe(600000)
  })

  it('blocks amount patch after finance touch and flags mismatch on regenerate', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const scheduleId = generated.body.data.schedules[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 1000000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({ adultUnitPriceCents: 90000 })
      .expect(400)

    expect(blocked.body.message).toBe('当前客源单已发生收款，不允许修改金额')

    await prisma.sourceOrder.update({
      where: { id: sourceOrder.id },
      data: {
        adultUnitPriceCents: 90000,
        grossReceivableCents: 900000,
        netReceivableCents: 900000,
        guestCollectCents: 900000,
      },
    })

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(regenerated.body.data.sourceAmountMismatch).toBe(true)
    expect(regenerated.body.data.schedules[0].amountCents).toBe(1000000)

    const fetched = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.id}`)
      .expect(200)

    expect(fetched.body.data.hasSourceAmountMismatch).toBe(true)
    expect(fetched.body.data.amountFieldsLocked).toBe(true)
  })

  it('allows coordinator to generate receivables but not create finance receivables directly', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const forbidden = await authRequest(app, coordinatorToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-manual`,
        amountCents: 10000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
      })
      .expect(403)

    expect(forbidden.body.message).toBe('无权访问')
  })

  it('rejects generate receivables when departure is closed', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id)

    await prisma.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.closed },
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)

    expect(response.body.message).toBe('发团已关闭，不可生成应收')
  })

  it('returns closed receivable status after all schedules are cancelled, distinct from not_generated', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
    })

    const before = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.id}`)
      .expect(200)

    expect(before.body.data).toMatchObject({
      hasPaymentSchedule: false,
      receivableStatus: 'not_generated',
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const scheduleIds = (
      generated.body.data.schedules as Array<{ id: string }>
    ).map((item) => item.id)

    for (const scheduleId of scheduleIds) {
      await authRequest(app, financeToken)
        .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
        .send({ cancelReason: '测试关闭全部路径' })
        .expect(201)
    }

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.id}`)
      .expect(200)

    expect(after.body.data).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'closed',
      amountFieldsLocked: true,
    })
    expect(after.body.data.receivableStatus).not.toBe('not_generated')
  })

  it('keeps receivable status from remaining active schedules when only one path is cancelled', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const customerSchedule = (
      generated.body.data.schedules as Array<{ id: string; sourceType: string }>
    ).find(
      (item) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    expect(customerSchedule).toBeDefined()

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${customerSchedule!.id}/cancel`)
      .send({ cancelReason: '仅关闭客户补款路径' })
      .expect(201)

    const fetched = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.id}`)
      .expect(200)

    expect(fetched.body.data).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'pending',
    })
    expect(fetched.body.data.receivableStatus).not.toBe('closed')
  })
})
