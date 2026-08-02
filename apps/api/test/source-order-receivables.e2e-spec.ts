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

    return response.body.data as {
      id: string
      displayName: string
      fareAdjustmentNetCents: number
      netReceivableCents: number
      guestCollectCents: number
    }
  }

  it('creates balance Guest + customer top-up for split when S>G约定', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 300000,
      balanceCents: 700000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(2)
    expect(response.body.data.sourceAmountMismatch).toBe(false)

    const byType = Object.fromEntries(
      response.body.data.schedules.map((item: { sourceType: string }) => [
        item.sourceType,
        item,
      ]),
    )
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION]).toMatchObject({
      title: '尾款代收',
      amountCents: 700000,
      counterpartyType: CounterpartyType.guest,
      counterpartyId: sourceOrder.id,
      counterpartyName: sourceOrder.displayName,
      departureId: departure.id,
      sourceId: sourceOrder.id,
      dueDate: '2026-08-10',
    })
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT]).toMatchObject({
      title: '客户补款',
      amountCents: 300000,
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
      counterpartyName: partnerName,
    })
    expect(
      byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION].scheduleNo,
    ).toMatch(AR_AP_SCHEDULE_NO_REGEX)

    expect(response.body.data.sourceOrder).toMatchObject({
      hasPaymentSchedule: true,
      receivableStatus: 'pending',
    })
  })

  it('creates only balance Guest for split when G约定 already covers S', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 300000,
      balanceCents: 1000000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(1)
    expect(response.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      amountCents: 1000000,
    })
  })

  it('creates deposit + balance Guest receivables for guest_only mode', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
      depositCents: 200000,
      balanceCents: 800000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(2)
    const byType = Object.fromEntries(
      response.body.data.schedules.map((item: { sourceType: string }) => [
        item.sourceType,
        item,
      ]),
    )
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION]).toMatchObject({
      title: '定金代收',
      amountCents: 200000,
      counterpartyType: CounterpartyType.guest,
    })
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION]).toMatchObject({
      title: '尾款代收',
      amountCents: 800000,
      counterpartyType: CounterpartyType.guest,
    })
    expect(
      response.body.data.schedules.some(
        (item: { sourceType: string }) =>
          item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      ),
    ).toBe(false)
  })

  it('skips zero-amount guest_only period when generating receivables', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(1)
    expect(response.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      amountCents: 1000000,
      title: '尾款代收',
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
      depositCents: 200000,
      balanceCents: 800000,
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)

    expect(second.body.message).toBe('当前客源单已提交应收，不能再次提交')

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

  it('backfills customer top-up when legacy split order only has balance Guest', async () => {
    // 苏州水乡类旧单：S=¥5000、尾款 G=¥200、旧规则只建了尾款代收，缺客户补款。
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      adultGuestCount: 5,
      adultUnitPriceCents: 100000,
      depositCents: 600000,
      balanceCents: 20000,
    })

    expect(sourceOrder.netReceivableCents).toBe(500000)

    await prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId: departure.id,
        direction: PaymentScheduleDirection.receivable,
        title: '尾款代收',
        amountCents: 20000,
        dueDate: new Date('2026-08-10'),
        counterpartyType: CounterpartyType.guest,
        counterpartyId: sourceOrder.id,
        counterpartyName: sourceOrder.displayName,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        sourceId: sourceOrder.id,
        scheduleNo: `AR${testPrefix.slice(-8)}LEGACY`,
      },
    })

    const listBefore = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/source-orders`)
      .expect(200)
    const beforeRow = listBefore.body.data.items.find(
      (item: { id: string }) => item.id === sourceOrder.id,
    )
    expect(beforeRow).toMatchObject({
      hasIncompleteReceivablePaths: true,
      receivableStatus: 'pending',
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(response.body.data.schedules).toHaveLength(1)
    expect(response.body.data.schedules[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      title: '客户补款',
      amountCents: 480000,
      counterpartyType: CounterpartyType.partner,
      counterpartyId: partnerId,
    })
    expect(response.body.data.sourceOrder).toMatchObject({
      hasIncompleteReceivablePaths: false,
      hasPaymentSchedule: true,
    })

    const active = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
      select: { sourceType: true, amountCents: true },
    })
    expect(active).toEqual(
      expect.arrayContaining([
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          amountCents: 20000,
        },
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          amountCents: 480000,
        },
      ]),
    )
    expect(active).toHaveLength(2)
  })

  it('creates each receivable source path only once under concurrent generation requests', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 200000,
      balanceCents: 800000,
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
      sourceTypes: receivables.body.data.items
        .map((item: { sourceType: string }) => item.sourceType)
        .sort(),
    }).toEqual({
      successCount: 1,
      scheduleCount: 2,
      sourceTypes: [
        PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      ].sort(),
    })
  })

  it('syncs balance schedule amount when source order is patched before finance touch', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 300000,
      balanceCents: 700000,
    })

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({ depositCents: 400000, balanceCents: 600000 })
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
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        cancelledAt: null,
      },
    })

    expect(customerSchedule?.amountCents).toBe(400000)
    expect(guestSchedule?.amountCents).toBe(600000)
    // Source→schedule sync must not stamp amountAdjustedAt / financeTouched.
    expect(guestSchedule?.amountAdjustedAt).toBeNull()
    expect(customerSchedule?.amountAdjustedAt).toBeNull()
  })

  it('syncs receivables when fare adjustments change before finance touch', async () => {
    const departure = await createDeparture()
    const created = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
      fareAdjustments: [
        {
          kind: 'single_room_topup',
          direction: 'increase',
          amountCents: 20000,
        },
      ],
    })

    expect(created).toMatchObject({
      fareAdjustmentNetCents: 20000,
      netReceivableCents: 1020000,
      guestCollectCents: 1020000,
    })

    const detail = await authRequest(app, coordinatorToken)
      .get(`/api/source-orders/${created.id}`)
      .expect(200)
    expect(detail.body.data.fareAdjustments).toEqual([
      expect.objectContaining({
        kind: 'single_room_topup',
        direction: 'increase',
        amountCents: 20000,
      }),
    ])

    await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${created.id}/generate-receivables`)
      .expect(201)

    // 团款调整改变 S；代收约定需显式改定金/尾款才会同步 Guest 节点。
    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${created.id}`)
      .send({
        fareAdjustments: [
          {
            kind: 'single_room_topup',
            direction: 'increase',
            amountCents: 50000,
          },
          {
            kind: 'ticket_discount_refund',
            direction: 'decrease',
            amountCents: 10000,
          },
        ],
        depositCents: 0,
        balanceCents: 1040000,
      })
      .expect(200)

    expect(patched.body.data).toMatchObject({
      fareAdjustmentNetCents: 40000,
      netReceivableCents: 1040000,
      guestCollectCents: 1040000,
      hasSourceAmountMismatch: false,
    })

    const guestSchedule = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: created.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        cancelledAt: null,
      },
    })
    expect(guestSchedule?.amountCents).toBe(1040000)
    expect(guestSchedule?.amountAdjustedAt).toBeNull()
  })

  it('blocks fare-adjustment patch after finance touch', async () => {
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
        amountCents: 100000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({
        fareAdjustments: [
          {
            kind: 'extended_stay',
            direction: 'increase',
            amountCents: 30000,
          },
        ],
      })
      .expect(400)

    expect(blocked.body.message).toBe('当前客源单已发生收款，不允许修改金额')
  })

  it('blocks same-net fare-adjustment line swap after finance touch', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
      fareAdjustments: [
        {
          kind: 'single_room_topup',
          direction: 'increase',
          amountCents: 20000,
        },
      ],
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)
    const scheduleId = generated.body.data.schedules[0].id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/receivables/${scheduleId}/confirm-collection`)
      .send({
        amountCents: 100000,
        transactionDate: '2026-07-01',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.guest,
        counterpartyName: sourceOrder.displayName,
      })
      .expect(201)

    const blocked = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({
        fareAdjustments: [
          {
            kind: 'extended_stay',
            direction: 'increase',
            amountCents: 20000,
          },
        ],
      })
      .expect(400)

    expect(blocked.body.message).toBe('当前客源单已发生收款，不允许修改金额')
  })

  it('syncs Guest paths when collection mode changes before finance touch', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
      depositCents: 300000,
      balanceCents: 700000,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    expect(generated.body.data.schedules).toHaveLength(2)

    const patched = await authRequest(app, coordinatorToken)
      .patch(`/api/source-orders/${sourceOrder.id}`)
      .send({
        collectionMode: SourceOrderCollectionMode.split,
        depositCents: 300000,
        balanceCents: 700000,
      })
      .expect(200)

    expect(patched.body.data).toMatchObject({
      collectionMode: SourceOrderCollectionMode.split,
      partnerCollectedCents: 300000,
      guestCollectCents: 700000,
      hasPaymentSchedule: true,
      hasSourceAmountMismatch: false,
    })

    const activeSchedules = await prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
    })
    // split + S=1_000_000、G约定=700_000 → 尾款代收 + 客户补款 300_000
    expect(activeSchedules).toHaveLength(2)
    const byType = Object.fromEntries(
      activeSchedules.map((item) => [item.sourceType, item]),
    )
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION]).toMatchObject({
      amountCents: 700000,
      title: '尾款代收',
    })
    expect(byType[PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT]).toMatchObject({
      amountCents: 300000,
      title: '客户补款',
    })

    const cancelledDeposit = await prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: sourceOrder.id,
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
        cancelledAt: { not: null },
      },
    })
    expect(cancelledDeposit).not.toBeNull()

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)
    expect(rejected.body.message).toBe('当前客源单已提交应收，不能再次提交')
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
        depositCents: 300000,
        balanceCents: 700000,
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
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
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
        depositCents: 0,
        balanceCents: 900000,
        guestCollectCents: 900000,
      },
    })

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(409)

    expect(regenerated.body.message).toBe('当前客源单已提交应收，不能再次提交')

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

    // 提交应收留在 /departure：计调可触发
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

    expect(response.body.message).toBe('发团已关闭，不可提交应收')
  })

  it('returns closed receivable status after all schedules are cancelled, distinct from not_generated', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.split,
      depositCents: 300000,
      balanceCents: 700000,
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

    expect(rejected.body.message).toBe('当前客源单已提交应收，不能再次提交')
  })

  it('keeps receivable status from remaining active schedules when only one path is cancelled', async () => {
    const departure = await createDeparture()
    const sourceOrder = await createSourceOrder(departure.id, {
      collectionMode: SourceOrderCollectionMode.guest_only,
      depositCents: 300000,
      balanceCents: 700000,
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/source-orders/${sourceOrder.id}/generate-receivables`)
      .expect(201)

    const depositSchedule = (
      generated.body.data.schedules as Array<{ id: string; sourceType: string }>
    ).find(
      (item) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
    )
    expect(depositSchedule).toBeDefined()

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${depositSchedule!.id}/cancel`)
      .send({ closeDisposition: 'business_dispute_stop', cancelReason: '仅关闭定金代收路径' })
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
