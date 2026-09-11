import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  PaymentScheduleSourceType,
  SourceOrderCollectionMode,
} from '@xiaotuanbao/shared'
import { DepartureFinanceGenerationService } from './departure-finance-generation.service'
import {
  loadReceivableSchedules,
  loadSourceOrderOrThrow,
  type SourceOrderWithRelations,
} from './departure-finance-schedule-loaders'

jest.mock('./departure-finance-schedule-loaders', () => {
  const actual = jest.requireActual('./departure-finance-schedule-loaders') as object
  return {
    ...actual,
    loadSourceOrderOrThrow: jest.fn(),
    loadReceivableSchedules: jest.fn(),
  }
})

const loadSourceOrderOrThrowMock = loadSourceOrderOrThrow as jest.MockedFunction<
  typeof loadSourceOrderOrThrow
>
const loadReceivableSchedulesMock = loadReceivableSchedules as jest.MockedFunction<
  typeof loadReceivableSchedules
>

function partnerSettledOrder(
  overrides?: Partial<SourceOrderWithRelations>,
): SourceOrderWithRelations {
  return {
    id: 'so-1',
    departureId: 'dep-1',
    partnerId: 'partner-1',
    displayName: '华东旅行社客源',
    collectionMode: SourceOrderCollectionMode.PARTNER_SETTLED,
    depositCents: 0,
    balanceCents: 0,
    netReceivableCents: 6_100_000,
    partner: { name: '华东旅行社' },
    departure: {
      id: 'dep-1',
      organizationId: 'org-1',
      status: 'pending_settlement',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-05T00:00:00.000Z'),
    },
    ...overrides,
  } as SourceOrderWithRelations
}

describe('DepartureFinanceGenerationService', () => {
  const service = Object.create(
    DepartureFinanceGenerationService.prototype,
  ) as DepartureFinanceGenerationService

  it('rejects non-resource source types on generateResourcePayable', async () => {
    await expect(
      service.generateResourcePayable(
        'org-1',
        { sourceType: PaymentScheduleSourceType.MANUAL, sourceId: 'x' },
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

})

describe('DepartureFinanceGenerationService initial_only / preview', () => {
  const tx = { $queryRaw: jest.fn().mockResolvedValue([]) }
  const create = jest.fn()
  const assertAllowsNewObligation = jest.fn()
  let service: DepartureFinanceGenerationService

  beforeEach(() => {
    create.mockReset()
    create.mockImplementation(async (_org: string, _dir: string, input: { title: string }) => ({
      id: `sch-${input.title}`,
      title: input.title,
    }))
    assertAllowsNewObligation.mockReset()
    loadSourceOrderOrThrowMock.mockReset()
    loadReceivableSchedulesMock.mockReset()
    tx.$queryRaw.mockClear()
    service = Object.create(
      DepartureFinanceGenerationService.prototype,
    ) as DepartureFinanceGenerationService
    Object.assign(service, {
      prisma: {},
      paymentScheduleService: { create },
    })
  })

  it('previews ready paths when no schedules exist', async () => {
    const order = partnerSettledOrder()
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([])

    const preview = await service.previewInitialReceivables('org-1', 'so-1', tx as never)

    expect(preview.classification.status).toBe('ready')
    expect(preview.expectedPaths).toEqual([
      expect.objectContaining({
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 6_100_000,
      }),
    ])
  })

  it('creates missing paths with initial_only when ready', async () => {
    const order = partnerSettledOrder()
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([])

    const result = await service.generateReceivableSchedules(
      'org-1',
      'so-1',
      assertAllowsNewObligation,
      { client: tx as never, strategy: 'initial_only' },
    )

    expect(assertAllowsNewObligation).toHaveBeenCalledWith(order.departure, '提交应收')
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.generation).toBe('created')
    expect(result.schedules).toHaveLength(1)
  })

  it('stops initial_only before create when new obligations are forbidden', async () => {
    const order = partnerSettledOrder({
      departure: {
        id: 'dep-1',
        organizationId: 'org-1',
        status: 'settled',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-05T00:00:00.000Z'),
      },
    })
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([])
    assertAllowsNewObligation.mockImplementation(() => {
      throw new ConflictException('发团已结清，不可提交应收')
    })

    await expect(
      service.generateReceivableSchedules(
        'org-1',
        'so-1',
        assertAllowsNewObligation,
        { client: tx as never, strategy: 'initial_only' },
      ),
    ).rejects.toThrow('发团已结清，不可提交应收')
    expect(create).not.toHaveBeenCalled()
  })

  it('treats complete_and_consistent as idempotent under initial_only', async () => {
    const order = partnerSettledOrder()
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([
      {
        id: 'sch-existing',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 6_100_000,
        cancelledAt: null,
        voidedAt: null,
      },
    ] as never)

    const result = await service.generateReceivableSchedules(
      'org-1',
      'so-1',
      assertAllowsNewObligation,
      { client: tx as never, strategy: 'initial_only' },
    )

    expect(create).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        generation: 'already_present',
        existingScheduleIds: ['sch-existing'],
      }),
    )
  })

  it('throws on anomaly under initial_only without creating schedules', async () => {
    const order = partnerSettledOrder()
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([
      {
        id: 'sch-partial',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 1_000_000,
        cancelledAt: null,
        voidedAt: null,
      },
    ] as never)

    await expect(
      service.generateReceivableSchedules(
        'org-1',
        'so-1',
        assertAllowsNewObligation,
        { client: tx as never, strategy: 'initial_only' },
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(create).not.toHaveBeenCalled()
  })

  it('ordinary generation refuses a complete existing set instead of treating it as idempotent', async () => {
    const order = partnerSettledOrder()
    loadSourceOrderOrThrowMock.mockResolvedValue(order)
    loadReceivableSchedulesMock.mockResolvedValue([
      {
        id: 'sch-existing',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 6_100_000,
        cancelledAt: null,
        voidedAt: null,
      },
    ] as never)

    await expect(
      service.generateReceivableSchedules('org-1', 'so-1', assertAllowsNewObligation, {
        client: tx as never,
      }),
    ).rejects.toThrow('当前客源单已提交应收，不能再次提交')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('DepartureFinanceGenerationService payable initial_only / preview', () => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    paymentSchedule: { findMany: jest.fn() },
  }
  const create = jest.fn()
  const assertAllowsNewObligation = jest.fn()
  let service: DepartureFinanceGenerationService
  const resource = {
    id: 'res-1',
    title: '4月2日住宿',
    amountCents: 880_000,
    resourceKind: 'hotel',
    counterpartyType: 'supplier',
    partnerId: null,
    supplierId: 'sup-1',
    partner: null,
    supplier: { name: '关西酒店' },
    segment: {
      id: 'seg-1',
      endDate: new Date('2026-04-02T00:00:00.000Z'),
      departure: {
        id: 'dep-1',
        organizationId: 'org-1',
        status: 'pending_settlement',
        endDate: new Date('2026-04-08T00:00:00.000Z'),
      },
    },
  }

  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({ id: 'sch-hotel' })
    assertAllowsNewObligation.mockReset()
    tx.$queryRaw.mockClear()
    tx.paymentSchedule.findMany.mockReset()
    tx.paymentSchedule.findMany.mockResolvedValue([])
    service = Object.create(
      DepartureFinanceGenerationService.prototype,
    ) as DepartureFinanceGenerationService
    Object.assign(service, {
      prisma: {},
      paymentScheduleService: { create },
      loadSegmentResourceOrThrow: jest.fn().mockResolvedValue(resource),
      loadDepartureResourceOrThrow: jest.fn(),
    })
  })

  it('previews a selected resource without creating a payable', async () => {
    const preview = await service.previewInitialPayable(
      'org-1',
      { sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE, sourceId: 'res-1' },
      tx as never,
    )
    expect(preview.classification).toEqual({ status: 'ready', amountCents: 880_000 })
    expect(create).not.toHaveBeenCalled()
  })

  it('creates the selected resource payable with initial_only', async () => {
    const result = await service.generateResourcePayable(
      'org-1',
      { sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE, sourceId: 'res-1' },
      assertAllowsNewObligation,
      { client: tx as never, strategy: 'initial_only' },
    )
    expect(assertAllowsNewObligation).toHaveBeenCalledWith(
      resource.segment.departure,
      '提交应付',
    )
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.generation).toBe('created')
    expect(result.schedule).toEqual({ id: 'sch-hotel' })
  })

  it('returns already_present without creating when the payable matches', async () => {
    tx.paymentSchedule.findMany.mockResolvedValue([
      { id: 'sch-existing', amountCents: 880_000, cancelledAt: null, voidedAt: null },
    ])
    const result = await service.generateResourcePayable(
      'org-1',
      { sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE, sourceId: 'res-1' },
      assertAllowsNewObligation,
      { client: tx as never, strategy: 'initial_only' },
    )
    expect(create).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        generation: 'already_present',
        existingScheduleIds: ['sch-existing'],
      }),
    )
  })

  it('refuses cancelled history under initial_only without recreating', async () => {
    tx.paymentSchedule.findMany.mockResolvedValue([
      {
        id: 'sch-cancelled',
        amountCents: 880_000,
        cancelledAt: new Date('2026-09-01'),
        voidedAt: null,
      },
    ])
    await expect(
      service.generateResourcePayable(
        'org-1',
        { sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE, sourceId: 'res-1' },
        assertAllowsNewObligation,
        { client: tx as never, strategy: 'initial_only' },
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(create).not.toHaveBeenCalled()
  })
})
