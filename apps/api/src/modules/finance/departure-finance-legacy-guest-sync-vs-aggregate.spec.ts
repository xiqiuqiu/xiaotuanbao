import {
  PaymentScheduleSourceType,
  SourceOrderCollectionMode,
  isSourceOrderReceivableSourceType,
} from '@xiaotuanbao/shared'
import { DepartureFinanceGenerationService } from './departure-finance-generation.service'
import {
  loadReceivableSchedules,
  loadRebateSchedules,
  type SourceOrderWithRelations,
} from './departure-finance-schedule-loaders'

jest.mock('./departure-finance-schedule-loaders', () => {
  const actual = jest.requireActual('./departure-finance-schedule-loaders') as object
  return {
    ...actual,
    loadReceivableSchedules: jest.fn(),
    loadRebateSchedules: jest.fn(),
  }
})

const loadReceivableSchedulesMock = loadReceivableSchedules as jest.MockedFunction<
  typeof loadReceivableSchedules
>
const loadRebateSchedulesMock = loadRebateSchedules as jest.MockedFunction<typeof loadRebateSchedules>

/**
 * Repro: close legacy guest_collection → syncSourceOrderConvention → mint balance
 * while snapshot still books closed-unreceived on the legacy node (double count).
 */
describe('legacy guest_collection: sync gate vs aggregation', () => {
  const closedLegacy = {
    id: 'sch-legacy-closed',
    sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    cancelledAt: new Date('2026-07-01T00:00:00.000Z'),
    amountCents: 30_000,
    title: '游客代收',
  }

  it('aggregation includes closed-with-remaining from cancelled legacy guest_collection', () => {
    // Mirrors getDepartureFinanceReadBundles receivable branch (facade ~544–552).
    const receivedOrPaidCents = 0
    const remainingCents = closedLegacy.amountCents - receivedOrPaidCents
    let sourceReceivableClosedUnreceivedCents = 0

    if (isSourceOrderReceivableSourceType(closedLegacy.sourceType)) {
      if (closedLegacy.cancelledAt) {
        sourceReceivableClosedUnreceivedCents += remainingCents
      }
    }

    expect(sourceReceivableClosedUnreceivedCents).toBe(30_000)
  })

  it('sync must not mint balance when closed legacy guest_collection is the only history', async () => {
    // guest_only / S=¥300 / deposit=0 / balance=¥300 — close legacy, then sync.
    loadReceivableSchedulesMock.mockResolvedValue([closedLegacy as never])
    loadRebateSchedulesMock.mockResolvedValue([])

    const create = jest.fn()
    const service = Object.create(
      DepartureFinanceGenerationService.prototype,
    ) as DepartureFinanceGenerationService
    Object.assign(service, {
      prisma: {},
      paymentScheduleService: { create, update: jest.fn() },
      verificationService: {
        getSettledAmountCents: jest.fn().mockResolvedValue(0),
        hasVerificationHistory: jest.fn().mockResolvedValue(false),
      },
    })

    const order = {
      id: 'so-1',
      departureId: 'dep-1',
      partnerId: 'partner-1',
      displayName: '游客甲',
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 0,
      balanceCents: 30_000,
      netReceivableCents: 30_000,
      partner: { name: '发客社' },
      departure: { startDate: new Date('2026-08-01T00:00:00.000Z') },
    } as unknown as SourceOrderWithRelations

    await service.syncSourceOrderConvention('org-1', order)

    expect(create).not.toHaveBeenCalled()
  })

  it('sync must not mint guest paths when closed legacy coexists with an active rebate', async () => {
    // hasLegacyGuestCollection must inspect allSchedules, not only active touchResults.
    loadReceivableSchedulesMock.mockResolvedValue([closedLegacy as never])
    loadRebateSchedulesMock.mockResolvedValue([
      {
        id: 'sch-rebate',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        cancelledAt: null,
        amountCents: 5_000,
        title: '返利',
      } as never,
    ])

    const create = jest.fn()
    const service = Object.create(
      DepartureFinanceGenerationService.prototype,
    ) as DepartureFinanceGenerationService
    Object.assign(service, {
      prisma: {},
      paymentScheduleService: { create, update: jest.fn() },
      verificationService: {
        getSettledAmountCents: jest.fn().mockResolvedValue(0),
        hasVerificationHistory: jest.fn().mockResolvedValue(false),
      },
    })

    const order = {
      id: 'so-1',
      departureId: 'dep-1',
      partnerId: 'partner-1',
      displayName: '游客甲',
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 0,
      balanceCents: 30_000,
      netReceivableCents: 30_000,
      partner: { name: '发客社' },
      departure: { startDate: new Date('2026-08-01T00:00:00.000Z') },
    } as unknown as SourceOrderWithRelations

    await service.syncSourceOrderConvention('org-1', order)

    expect(create).not.toHaveBeenCalled()
  })
})
