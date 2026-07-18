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
  let partnerName: string
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
    partnerName = partner.name
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
        OR: [
          { departure: { name: { startsWith: testPrefix } } },
          {
            verifications: {
              some: {
                paymentSchedule: {
                  departure: { name: { startsWith: testPrefix } },
                },
              },
            },
          },
        ],
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
      // 出团 2026-07-01 → 应收到期日下月 10 日
      expect(schedule.dueDate).toBe('2026-08-10')
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
      counterpartyName: partnerName,
    })
    expect(guestSchedule).toMatchObject({
      title: '游客代收',
      amountCents: 700000,
      counterpartyType: CounterpartyType.guest,
      counterpartyId: sourceOrder.id,
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
      counterpartyName: partnerName,
    })
  })

  it('rejects generate receivables when finance trace already exists', async () => {
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
      .expect(409)

    expect(second.body.message).toBe('当前客源单已生成应收，不能再次生成')

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

  it('creates each receivable source path only once under concurrent generation requests', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 200000,
    })

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, coordinatorToken)
          .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`),
      ),
    )

    const receivables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/receivables`)
      .expect(200)

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      scheduleCount: receivables.body.data.total,
      sourceTypes: receivables.body.data.items.map(
        (item: { sourceType: string }) => item.sourceType,
      ),
    }).toEqual({
      successCount: 1,
      scheduleCount: 2,
      sourceTypes: expect.arrayContaining([
        PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      ]),
    })
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
    // Source→schedule sync must not stamp amountAdjustedAt / financeTouched.
    expect(customerSchedule?.amountAdjustedAt).toBeNull()
    expect(guestSchedule?.amountAdjustedAt).toBeNull()
  })

  it('creates missing receivable path on save when not finance-touched', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(generated.body.data.schedules).toHaveLength(1)
    expect(generated.body.data.schedules[0].sourceType).toBe(
      PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 300000,
      })
      .expect(200)

    expect(patched.body.data).toMatchObject({
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
      guestCollectCents: 700000,
      hasPaymentSchedule: true,
      hasSourceAmountMismatch: false,
    })

    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
      orderBy: { sourceType: 'asc' },
    })

    expect(schedules).toHaveLength(2)

    const customerSchedule = schedules.find(
      (item) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    const guestSchedule = schedules.find(
      (item) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    expect(customerSchedule).toMatchObject({
      amountCents: 300000,
      title: '客户补款',
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
    })
    expect(guestSchedule).toMatchObject({
      amountCents: 700000,
      title: '游客代收',
    })

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)
    expect(rejected.body.message).toBe('当前客源单已生成应收，不能再次生成')
  })

  it('does not create missing receivable path after finance touch', async () => {
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
        amountCents: 200000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(201)

    await prisma.sourceOrder.update({
      where: { id: sourceOrder.id },
      data: {
        collectionMode: SourceOrderCollectionMode.split,
        partnerCollectedCents: 300000,
        guestCollectCents: 700000,
      },
    })

    const notesOnly = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({ notes: 'touched 后仅改备注，不应补建路径' })
      .expect(200)

    expect(notesOnly.body.data.hasSourceAmountMismatch).toBe(true)
    expect(notesOnly.body.data.amountFieldsLocked).toBe(true)

    const schedules = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
    })

    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toMatchObject({
      id: scheduleId,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      amountCents: 1000000,
    })
  })

  it('blocks amount patch after finance touch and rejects regenerate', async () => {
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
      .expect(409)

    expect(regenerated.body.message).toBe('当前客源单已生成应收，不能再次生成')

    const fetched = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${sourceOrder.id}`)
      .expect(200)

    expect(fetched.body.data.hasSourceAmountMismatch).toBe(true)
    expect(fetched.body.data.amountFieldsLocked).toBe(true)

    const schedule = await prisma.paymentSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    })
    expect(schedule.amountCents).toBe(1000000)
  })

  it('allows coordinator to generate receivables but rejects manual finance receivables (ADR-0023)', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id)

    // 生成应收留在 /departure：计调可触发
    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    // 手工新建财务应收属 /finance/receivable：计调收回菜单后 403
    await authRequest(app, coordinatorToken)
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

    // 财务角色仍可手工新建
    const created = await authRequest(app, financeToken)
      .post('/api/finance/receivables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-manual`,
        amountCents: 10000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
      })
      .expect(201)

    expect(created.body.data.title).toBe(`${testPrefix}-manual`)
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
        .send({ closeDisposition: 'external_or_special', cancelReason: '测试关闭全部路径' })
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

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)

    expect(rejected.body.message).toBe('当前客源单已生成应收，不能再次生成')
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
      .send({ closeDisposition: 'business_dispute_stop', cancelReason: '仅关闭客户补款路径' })
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
