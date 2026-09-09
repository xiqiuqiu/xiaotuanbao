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

  it('dispatches segment_resource to generatePayable', async () => {
    const generatePayable = jest.spyOn(service, 'generatePayable').mockResolvedValue({
      schedule: { id: 'sch-1' } as never,
      resource: { id: 'seg-res-1' } as never,
    })

    const result = await service.generateResourcePayable(
      'org-1',
      {
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: 'seg-res-1',
      },
      () => undefined,
    )

    expect(generatePayable).toHaveBeenCalledWith('org-1', 'seg-res-1', expect.any(Function))
    expect(result.resourceKind).toBe('segment')
  })

  it('dispatches departure_resource to generateDepartureResourcePayable', async () => {
    const generateDeparture = jest
      .spyOn(service, 'generateDepartureResourcePayable')
      .mockResolvedValue({
        schedule: { id: 'sch-2' } as never,
        resource: { id: 'dep-res-1' } as never,
      })

    const result = await service.generateResourcePayable(
      'org-1',
      {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: 'dep-res-1',
      },
      () => undefined,
    )

    expect(generateDeparture).toHaveBeenCalledWith('org-1', 'dep-res-1', expect.any(Function))
    expect(result.resourceKind).toBe('departure')
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
