import type { INestApplication } from '@nestjs/common'
import {
  CounterpartyType,
  DepartureStatus,
  DirectoryProfileStatus,
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
  let ownerUserName: string
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
    ownerUserName = user.name

    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        name: `${testPrefix}-supplier`,
        categories: [ResourceKind.transport, ResourceKind.outsource],
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

  it('uses Supplier counterparty for outsource resources', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id, {
      resourceKind: ResourceKind.outsource,
      supplierId,
      title: '阿勒泰拼出',
      amountCents: 800000,
    })

    const response = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(response.body.data.schedule).toMatchObject({
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: supplierId,
      amountCents: 800000,
      title: '阿勒泰拼出',
    })
  })

  it('rejects generate payable when finance trace already exists', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const second = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(409)

    expect(second.body.message).toBe('当前资源已生成应付，不能再次生成')

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

  it('creates one payable with conflict responses under concurrent generation requests', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        authRequest(app, coordinatorToken)
          .post(`/api/segment-resources/${resource.id}/generate-payable`),
      ),
    )

    const payables = await authRequest(app, coordinatorToken)
      .get(`/api/departures/${departure.id}/payables`)
      .expect(200)

    expect({
      successCount: responses.filter((response) => response.status === 201).length,
      conflictCount: responses.filter((response) => response.status === 409).length,
      unexpectedStatuses: responses
        .map((response) => response.status)
        .filter((status) => status !== 201 && status !== 409),
      scheduleCount: payables.body.data.total,
    }).toEqual({
      successCount: 1,
      conflictCount: 7,
      unexpectedStatuses: [],
      scheduleCount: 1,
    })
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
    expect(schedule?.amountAdjustedAt).toBeNull()

    const scheduleDetail = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${schedule!.id}`)
      .expect(200)
    expect(scheduleDetail.body.data.financeTouched).toBe(false)
  })

  /**
   * Ordinary payable edit before finance touch must keep resource/schedule aligned
   * and must NOT mark financeTouched via amountAdjustedAt (ADR-0010).
   */
  it('keeps resource amount in sync when payable is patched before finance touch', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)
    const originalAmountCents = 160000
    const editedAmountCents = 90000

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)
    const scheduleId = generated.body.data.schedule.id as string

    expect(generated.body.data.schedule.amountCents).toBe(originalAmountCents)

    const edited = await authRequest(app, financeToken)
      .patch(`/api/finance/payables/${scheduleId}`)
      .send({ amountCents: editedAmountCents })
      .expect(200)

    expect(edited.body.data).toMatchObject({
      amountCents: editedAmountCents,
      financeTouched: false,
      amountAdjustedAt: null,
    })

    const resourceAfter = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)

    expect({
      resourceAmountCents: resourceAfter.body.data.amountCents,
      scheduleAmountCents: edited.body.data.amountCents,
      hasSourceAmountMismatch: resourceAfter.body.data.hasSourceAmountMismatch,
      amountFieldsLocked: resourceAfter.body.data.amountFieldsLocked,
      financeTouched: edited.body.data.financeTouched,
    }).toEqual({
      resourceAmountCents: editedAmountCents,
      scheduleAmountCents: editedAmountCents,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      financeTouched: false,
    })
  })

  it('blocks amount patch after finance touch and rejects regenerate', async () => {
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
      .expect(409)

    expect(regenerated.body.message).toBe('当前资源已生成应付，不能再次生成')

    const fetched = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)

    expect(fetched.body.data.hasSourceAmountMismatch).toBe(true)
    expect(fetched.body.data.amountFieldsLocked).toBe(true)

    const schedule = await prisma.paymentSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
    })
    expect(schedule.amountCents).toBe(160000)
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

  it('allows coordinator to generate payables but rejects manual finance payables (ADR-0023)', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    // 生成应付留在 /departure：计调可触发
    await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    // 手工新建财务应付属 /finance/payable：计调收回菜单后 403
    await authRequest(app, coordinatorToken)
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

    // 财务角色仍可手工新建
    const created = await authRequest(app, financeToken)
      .post('/api/finance/payables')
      .send({
        departureId: departure.id,
        title: `${testPrefix}-manual`,
        amountCents: 10000,
        dueDate: '2026-12-31',
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(201)

    expect(created.body.data.title).toBe(`${testPrefix}-manual`)
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

  it('returns closed payable status after schedule is cancelled, distinct from not_generated', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    const before = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)

    expect(before.body.data).toMatchObject({
      hasPaymentSchedule: false,
      payableStatus: 'not_generated',
    })

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const scheduleId = generated.body.data.schedule.id as string

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${scheduleId}/confirm-payment`)
      .send({
        amountCents: 10000,
        transactionDate: '2026-07-02',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(201)

    await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '测试关闭应付' })
      .expect(201)

    const after = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)

    expect(after.body.data).toMatchObject({
      hasPaymentSchedule: true,
      payableStatus: 'closed',
      amountFieldsLocked: true,
    })
    expect(after.body.data.payableStatus).not.toBe('not_generated')

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(409)

    expect(rejected.body.message).toBe('当前资源已生成应付，不能再次生成')
  })

  it('voids an untouched payable, unlocks the resource, and allows regeneration and payment', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)

    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)
    const voidedScheduleId = generated.body.data.schedule.id as string

    const voided = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${voidedScheduleId}/void-resource-payable`)
      .send({ voidReason: '供应商报价录入错误' })
      .expect(201)

    expect(voided.body.data).toMatchObject({
      id: voidedScheduleId,
      voidReason: '供应商报价录入错误',
      voidedAmountCents: 160000,
      voidedBy: ownerUserId,
    })
    expect(voided.body.data.voidedAt).toEqual(expect.any(String))

    const defaultGlobalList = await authRequest(app, financeToken)
      .get('/api/finance/payables')
      .expect(200)
    expect(defaultGlobalList.body.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: voidedScheduleId })]),
    )

    const defaultDepartureList = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}/payables`)
      .expect(200)
    expect(defaultDepartureList.body.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: voidedScheduleId })]),
    )

    const voidedGlobalList = await authRequest(app, financeToken)
      .get('/api/finance/payables?status=voided')
      .expect(200)
    expect(voidedGlobalList.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: voidedScheduleId,
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: resource.id,
          voidReason: '供应商报价录入错误',
          voidedAmountCents: 160000,
          voidedBy: ownerUserId,
          voidedByName: ownerUserName,
          voidedAt: expect.any(String),
        }),
      ]),
    )

    const voidedDepartureList = await authRequest(app, financeToken)
      .get(`/api/departures/${departure.id}/payables?status=voided`)
      .expect(200)
    expect(voidedDepartureList.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: voidedScheduleId })]),
    )

    const audit = await authRequest(app, financeToken)
      .get(`/api/finance/payables/${voidedScheduleId}`)
      .expect(200)
    expect(audit.body.data.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: 'void',
          note: '供应商报价录入错误',
          amountCents: 160000,
          operatedBy: ownerUserId,
          operatedAt: expect.any(String),
        }),
      ]),
    )

    const unlocked = await authRequest(app, coordinatorToken)
      .get(`/api/segment-resources/${resource.id}`)
      .expect(200)
    expect(unlocked.body.data).toMatchObject({
      hasPaymentSchedule: false,
      payableStatus: 'not_generated',
      amountFieldsLocked: false,
    })

    await authRequest(app, coordinatorToken)
      .patch(`/api/segment-resources/${resource.id}`)
      .send({ amountCents: 180000 })
      .expect(200)

    const regenerated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    expect(regenerated.body.data.schedule).toMatchObject({
      sourceId: resource.id,
      amountCents: 180000,
    })
    expect(regenerated.body.data.schedule.id).not.toBe(voidedScheduleId)

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${regenerated.body.data.schedule.id}/confirm-payment`)
      .send({
        amountCents: 180000,
        transactionDate: '2026-07-02',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(201)
  })

  it('keeps untouched resource payable close and void actions mutually exclusive', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const rejected = await authRequest(app, financeToken)
      .post(`/api/finance/payment-schedules/${generated.body.data.schedule.id}/cancel`)
      .send({ closeDisposition: 'other', cancelReason: '未介入不应关闭' })
      .expect(400)

    expect(rejected.body.message).toBe('财务未介入的资源应付请使用作废')
  })

  it('validates void reason and replays the same idempotent void result once', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)
    const scheduleId = generated.body.data.schedule.id as string

    await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
      .send({ voidReason: '   ' })
      .expect(400)
    await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
      .send({ voidReason: '误'.repeat(201) })
      .expect(400)

    const key = `${testPrefix}-void-replay-${scheduleId}`
    const first = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
      .set('Idempotency-Key', key)
      .send({ voidReason: '重复请求测试' })
      .expect(201)
    const replay = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${scheduleId}/void-resource-payable`)
      .set('Idempotency-Key', key)
      .send({ voidReason: '重复请求测试' })
      .expect(201)

    expect(replay.body.data).toEqual(first.body.data)
    expect(
      await prisma.paymentScheduleActivity.count({
        where: { paymentScheduleId: scheduleId, activityType: 'void' },
      }),
    ).toBe(1)
  })

  it('rejects void after any verification history, even when the verification was cancelled', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)
    const schedule = generated.body.data.schedule as { id: string; scheduleNo: string }

    await authRequest(app, financeToken)
      .post(`/api/finance/payables/${schedule.id}/confirm-payment`)
      .send({
        amountCents: 10000,
        transactionDate: '2026-07-02',
        paymentChannel: PaymentChannel.OTHER,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      })
      .expect(201)
    const verifications = await authRequest(app, financeToken)
      .get('/api/finance/verifications')
      .query({ scheduleNo: schedule.scheduleNo, scheduleNoMatch: 'exact' })
      .expect(200)
    await authRequest(app, financeToken)
      .post(`/api/finance/verifications/${verifications.body.data.items[0].id}/cancel`)
      .send({ cancelReason: '撤销测试核销' })
      .expect(201)

    const rejected = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${schedule.id}/void-resource-payable`)
      .send({ voidReason: '不应允许' })
      .expect(400)
    expect(rejected.body.message).toBe('已有核销历史的资源应付不可作废')
  })

  it('rejects void after an explicit amount adjustment or close', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const adjustedResource = await createResource(segment.id)
    const adjusted = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${adjustedResource.id}/generate-payable`)
      .expect(201)
    await prisma.paymentSchedule.update({
      where: { id: adjusted.body.data.schedule.id },
      data: { amountAdjustedAt: new Date() },
    })

    const adjustedReject = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${adjusted.body.data.schedule.id}/void-resource-payable`)
      .send({ voidReason: '不应允许' })
      .expect(400)
    expect(adjustedReject.body.message).toBe('已调整约定金额的资源应付不可作废')

    const closedResource = await createResource(segment.id, { title: '已关闭资源' })
    const closed = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${closedResource.id}/generate-payable`)
      .expect(201)
    await prisma.paymentSchedule.update({
      where: { id: closed.body.data.schedule.id },
      data: { cancelledAt: new Date(), cancelledBy: ownerUserId, cancelReason: '测试关闭' },
    })

    const closedReject = await authRequest(app, coordinatorToken)
      .post(`/api/finance/payment-schedules/${closed.body.data.schedule.id}/void-resource-payable`)
      .send({ voidReason: '不应允许' })
      .expect(400)
    expect(closedReject.body.message).toBe('已关闭的资源应付不可作废')
  })

  it('keeps at most one active payable during concurrent void and generation', async () => {
    const departure = await createDeparture()
    const segment = await createSegment(departure.id)
    const resource = await createResource(segment.id)
    const generated = await authRequest(app, coordinatorToken)
      .post(`/api/segment-resources/${resource.id}/generate-payable`)
      .expect(201)

    const [voidResponse, generateResponse] = await Promise.all([
      authRequest(app, coordinatorToken)
        .post(`/api/finance/payment-schedules/${generated.body.data.schedule.id}/void-resource-payable`)
        .send({ voidReason: '并发纠错' }),
      authRequest(app, coordinatorToken)
        .post(`/api/segment-resources/${resource.id}/generate-payable`),
    ])

    expect(voidResponse.status).toBe(201)
    expect([201, 409]).toContain(generateResponse.status)
    const activeCount = await prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: resource.id,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })
    expect(activeCount).toBeLessThanOrEqual(1)
  })
})
