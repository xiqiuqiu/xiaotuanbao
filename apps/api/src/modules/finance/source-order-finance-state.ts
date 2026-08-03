import type { PaymentSchedule } from '@prisma/client'
import {
  deriveScheduleState,
  deriveSourceOrderReceivableStatus,
  isFinanceTouched,
  PaymentScheduleStatus,
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import { formatDateOnly, getShanghaiTodayString } from '../departure/departure-date.utils'
import { buildSourceOrderReceivablePaths } from '../departure/source-order-receivable-paths'
import type { SourceOrderFinanceMeta } from './departure-finance-schedule-loaders'

export type SourceOrderFinanceAmountInput = {
  collectionMode: string
  depositCents: number
  balanceCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
  id?: string
  partnerId?: string
  displayName?: string
}

export function buildSourceOrderFinanceMeta(params: {
  amounts: SourceOrderFinanceAmountInput
  receivableSchedules: PaymentSchedule[]
  rebateSchedules: PaymentSchedule[]
  settledMap: Map<string, number>
  historyMap: Map<string, boolean>
}): SourceOrderFinanceMeta {
  const { amounts, receivableSchedules, rebateSchedules, settledMap, historyMap } = params

  if (receivableSchedules.length === 0 && rebateSchedules.length === 0) {
    return {
      hasSchedule: false,
      receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus: SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }
  }

  const activeSchedules = receivableSchedules.filter((schedule) => schedule.cancelledAt == null)
  const activeRebates = rebateSchedules.filter((schedule) => schedule.cancelledAt == null)
  if (activeSchedules.length === 0 && activeRebates.length === 0) {
    return {
      hasSchedule: true,
      receivableStatus: SourceOrderReceivableStatus.CLOSED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: true,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus:
        rebateSchedules.length > 0
          ? SegmentPayableStatus.CLOSED
          : SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }
  }

  let hasSourceAmountMismatch = false
  let amountFieldsLocked = false

  for (const schedule of activeRebates) {
    const settledAmountCents = settledMap.get(schedule.id) ?? 0
    if (
      isFinanceTouched(schedule, settledAmountCents, historyMap.get(schedule.id) ?? false)
    ) {
      amountFieldsLocked = true
    }
  }

  const scheduleStates = activeSchedules.map((schedule) => {
    const settledAmountCents = settledMap.get(schedule.id) ?? 0
    const touched = isFinanceTouched(
      schedule,
      settledAmountCents,
      historyMap.get(schedule.id) ?? false,
    )
    if (touched) {
      amountFieldsLocked = true
      const expectedAmount = getExpectedAmountForSchedule(schedule.sourceType, amounts)
      if (expectedAmount > 0 && schedule.amountCents !== expectedAmount) {
        hasSourceAmountMismatch = true
      }
    }

    return {
      amountCents: schedule.amountCents,
      settledAmountCents,
      status: deriveScheduleState({
        amountCents: schedule.amountCents,
        settledAmountCents,
        dueDate: formatDateOnly(schedule.dueDate),
        cancelledAt: schedule.cancelledAt,
        businessDate: getShanghaiTodayString(),
        direction: schedule.direction,
      }),
    }
  })

  let receivableStatus = SourceOrderReceivableStatus.PENDING
  if (scheduleStates.length > 0) {
    receivableStatus = deriveSourceOrderReceivableStatus(scheduleStates)
    if (receivableStatus === SourceOrderReceivableStatus.COLLECTED) {
      amountFieldsLocked = true
    }
  }

  const { rebateCents, rebateStatus, rebateScheduleNo } = deriveSourceOrderRebateMeta(
    activeRebates,
    rebateSchedules.length > 0,
    settledMap,
  )

  const expectedPaths = buildSourceOrderReceivablePaths({
    sourceOrderId: amounts.id ?? 'source-order',
    partnerId: amounts.partnerId ?? 'partner',
    partnerName: '',
    displayName: amounts.displayName ?? '',
    collectionMode: amounts.collectionMode,
    depositCents: amounts.depositCents,
    balanceCents: amounts.balanceCents,
    netReceivableCents: amounts.netReceivableCents,
  }).filter((path) => path.amountCents > 0)
  const activeSourceTypes = new Set(activeSchedules.map((schedule) => schedule.sourceType))
  const hasIncompleteReceivablePaths = expectedPaths.some(
    (path) => !activeSourceTypes.has(path.sourceType),
  )

  return {
    hasSchedule: true,
    receivableStatus,
    hasSourceAmountMismatch,
    amountFieldsLocked,
    hasIncompleteReceivablePaths,
    rebateCents,
    rebateStatus,
    rebateScheduleNo,
  }
}

function getExpectedAmountForSchedule(
  sourceType: string,
  order: SourceOrderFinanceAmountInput,
): number {
  const paths = buildSourceOrderReceivablePaths({
    sourceOrderId: order.id ?? 'source-order',
    partnerId: order.partnerId ?? 'partner',
    partnerName: '',
    displayName: order.displayName ?? '',
    collectionMode: order.collectionMode,
    depositCents: order.depositCents,
    balanceCents: order.balanceCents,
    netReceivableCents: order.netReceivableCents,
  })
  return paths.find((path) => path.sourceType === sourceType)?.amountCents ?? 0
}

function deriveSourceOrderRebateMeta(
  activeRebates: PaymentSchedule[],
  hadRebateSchedule: boolean,
  settledMap: Map<string, number>,
): {
  rebateCents: number
  rebateStatus: SegmentPayableStatus
  rebateScheduleNo: string | null
} {
  if (activeRebates.length === 0) {
    return {
      rebateCents: 0,
      rebateStatus: hadRebateSchedule
        ? SegmentPayableStatus.CLOSED
        : SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    }
  }

  let rebateCents = 0
  let anyPartial = false
  let allPaid = true

  for (const schedule of activeRebates) {
    rebateCents += schedule.amountCents
    const settledAmountCents = settledMap.get(schedule.id) ?? 0
    const status = deriveScheduleState({
      amountCents: schedule.amountCents,
      settledAmountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      cancelledAt: schedule.cancelledAt,
      businessDate: getShanghaiTodayString(),
      direction: schedule.direction,
    })

    if (status !== PaymentScheduleStatus.SETTLED) {
      allPaid = false
    }
    if (settledAmountCents > 0 && settledAmountCents < schedule.amountCents) {
      anyPartial = true
    }
  }

  const rebateScheduleNo = activeRebates[0]?.scheduleNo ?? null

  if (allPaid) {
    return { rebateCents, rebateStatus: SegmentPayableStatus.PAID, rebateScheduleNo }
  }
  if (anyPartial) {
    return { rebateCents, rebateStatus: SegmentPayableStatus.PARTIAL, rebateScheduleNo }
  }
  return { rebateCents, rebateStatus: SegmentPayableStatus.PENDING, rebateScheduleNo }
}
