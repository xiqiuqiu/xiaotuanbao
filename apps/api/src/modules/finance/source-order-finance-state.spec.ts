import {
  PaymentScheduleDirection,
  type PaymentSchedule,
} from '@prisma/client'
import {
  PaymentScheduleSourceType,
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import { buildSourceOrderFinanceMeta } from './source-order-finance-state'

function schedule(partial: {
  id: string
  sourceType: string
  amountCents: number
  cancelledAt?: Date | null
  dueDate?: Date
}): PaymentSchedule {
  return {
    id: partial.id,
    organizationId: 'org-1',
    departureId: 'dep-1',
    direction: PaymentScheduleDirection.receivable,
    sourceType: partial.sourceType,
    sourceId: 'so-1',
    amountCents: partial.amountCents,
    title: 't',
    scheduleNo: `PS-${partial.id}`,
    counterpartyType: 'partner',
    counterpartyId: 'p1',
    counterpartyName: 'P',
    dueDate: partial.dueDate ?? new Date('2099-01-01T00:00:00.000Z'),
    cancelledAt: partial.cancelledAt ?? null,
    voidedAt: null,
    closeDisposition: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PaymentSchedule
}

describe('buildSourceOrderFinanceMeta', () => {
  const amounts = {
    collectionMode: 'partner_settled',
    depositCents: 0,
    balanceCents: 0,
    netReceivableCents: 10_000,
    partnerCollectedCents: 0,
    guestCollectCents: 0,
  }

  it('returns not-generated when there are no receivable or rebate schedules', () => {
    expect(
      buildSourceOrderFinanceMeta({
        amounts,
        receivableSchedules: [],
        rebateSchedules: [],
        settledMap: new Map(),
        historyMap: new Map(),
      }),
    ).toEqual({
      hasSchedule: false,
      receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus: SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    })
  })

  it('marks closed and locked when only cancelled receivable schedules remain', () => {
    const closed = schedule({
      id: 's1',
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: 10_000,
      cancelledAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    expect(
      buildSourceOrderFinanceMeta({
        amounts,
        receivableSchedules: [closed],
        rebateSchedules: [],
        settledMap: new Map([['s1', 0]]),
        historyMap: new Map([['s1', false]]),
      }),
    ).toMatchObject({
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.CLOSED,
      amountFieldsLocked: true,
      hasIncompleteReceivablePaths: false,
    })
  })

  it('aggregates pending active customer settlement as pending receivable', () => {
    const active = schedule({
      id: 's1',
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: 10_000,
    })

    expect(
      buildSourceOrderFinanceMeta({
        amounts,
        receivableSchedules: [active],
        rebateSchedules: [],
        settledMap: new Map([['s1', 0]]),
        historyMap: new Map([['s1', false]]),
      }),
    ).toMatchObject({
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.PENDING,
      amountFieldsLocked: false,
      hasSourceAmountMismatch: false,
      hasIncompleteReceivablePaths: false,
    })
  })

  it('flags incomplete paths when expected customer settlement is missing', () => {
    const guestOnlyAmounts = {
      collectionMode: 'guest_only',
      depositCents: 3_000,
      balanceCents: 7_000,
      netReceivableCents: 10_000,
      partnerCollectedCents: 0,
      guestCollectCents: 10_000,
    }
    const depositOnly = schedule({
      id: 's1',
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
      amountCents: 3_000,
    })

    expect(
      buildSourceOrderFinanceMeta({
        amounts: guestOnlyAmounts,
        receivableSchedules: [depositOnly],
        rebateSchedules: [],
        settledMap: new Map([['s1', 0]]),
        historyMap: new Map([['s1', false]]),
      }).hasIncompleteReceivablePaths,
    ).toBe(true)
  })

  it('locks and flags mismatch when touched schedule amount differs from agreed', () => {
    const active = schedule({
      id: 's1',
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: 8_000,
    })

    expect(
      buildSourceOrderFinanceMeta({
        amounts,
        receivableSchedules: [active],
        rebateSchedules: [],
        settledMap: new Map([['s1', 1_000]]),
        historyMap: new Map([['s1', true]]),
      }),
    ).toMatchObject({
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.PARTIAL,
      amountFieldsLocked: true,
      hasSourceAmountMismatch: true,
    })
  })

  it('includes active rebate payable meta', () => {
    const rebate = {
      ...schedule({
        id: 'r1',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
        amountCents: 500,
      }),
      direction: PaymentScheduleDirection.payable,
      scheduleNo: 'PS-R1',
    } as PaymentSchedule

    expect(
      buildSourceOrderFinanceMeta({
        amounts,
        receivableSchedules: [],
        rebateSchedules: [rebate],
        settledMap: new Map([['r1', 0]]),
        historyMap: new Map([['r1', false]]),
      }),
    ).toMatchObject({
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.PENDING,
      rebateCents: 500,
      rebateStatus: SegmentPayableStatus.PENDING,
      rebateScheduleNo: 'PS-R1',
    })
  })
})
