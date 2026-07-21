import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'

export type GuestCollectionSettledHint = 'open' | 'settled' | 'no_schedule' | 'covered'

export interface GuestCollectionScheduleAmountInput {
  sourceType: string
  amountCents: number
  unsettledAmountCents: number
  cancelledAt: string | null
}

export interface GuestCollectionAmountSuggestion {
  suggestedAmountCents: number
  hasSchedule: boolean
  pathAmountCents?: number
  agreedAmountCents?: number
  /** 同客源单上已有、未作废的未核销游客代收流水合计（编辑时已排除当前流水）。 */
  existingUnallocatedCents: number
  settledHint: GuestCollectionSettledHint
}

/**
 * 游客代收流水金额建议：以节点未结清（或路径金额）为上限，再扣减同路径已有未核销流水。
 * 仅为录入参考，不构成后端硬拦；资金层仍允许超额收款。
 */
export function resolveGuestCollectionAmountSuggestion(params: {
  schedules: GuestCollectionScheduleAmountInput[]
  guestCollectCents: number
  existingUnallocatedGuestCents?: number
}): GuestCollectionAmountSuggestion {
  const existingUnallocatedCents = Math.max(0, params.existingUnallocatedGuestCents ?? 0)
  const guestSchedules = params.schedules.filter(
    (schedule) => schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
  )
  const openSchedule =
    guestSchedules.find((schedule) => schedule.cancelledAt == null) ?? guestSchedules[0]

  if (!openSchedule) {
    const remaining = Math.max(0, params.guestCollectCents - existingUnallocatedCents)
    return {
      suggestedAmountCents: remaining,
      hasSchedule: false,
      agreedAmountCents: params.guestCollectCents,
      existingUnallocatedCents,
      settledHint: remaining === 0 && params.guestCollectCents > 0 ? 'covered' : 'no_schedule',
    }
  }

  const unsettled = openSchedule.unsettledAmountCents
  if (unsettled === 0) {
    return {
      suggestedAmountCents: 0,
      hasSchedule: true,
      pathAmountCents: openSchedule.amountCents,
      agreedAmountCents: params.guestCollectCents,
      existingUnallocatedCents,
      settledHint: 'settled',
    }
  }

  const remaining = Math.max(0, unsettled - existingUnallocatedCents)
  return {
    suggestedAmountCents: remaining,
    hasSchedule: true,
    pathAmountCents: openSchedule.amountCents,
    agreedAmountCents: params.guestCollectCents,
    existingUnallocatedCents,
    settledHint: remaining === 0 ? 'covered' : 'open',
  }
}

/** 换客源单时：仅当金额仍等于上一笔建议值（或已清空）才覆盖。 */
export function shouldReplaceSuggestedAmount(params: {
  currentYuan: number | undefined | null
  previousSuggestedYuan: number | undefined | null
}): boolean {
  if (params.previousSuggestedYuan == null) {
    return false
  }
  if (params.currentYuan == null || Number.isNaN(params.currentYuan)) {
    return true
  }
  return params.currentYuan === params.previousSuggestedYuan
}

export function formatGuestCollectionSuggestionText(
  suggestion: GuestCollectionAmountSuggestion,
  formatCents: (cents: number) => string,
): string {
  if (suggestion.settledHint === 'settled') {
    return '该节点已结清'
  }
  if (suggestion.settledHint === 'covered') {
    return '已有未核销游客代收流水已覆盖参考金额'
  }
  if (suggestion.settledHint === 'no_schedule') {
    if (suggestion.existingUnallocatedCents > 0) {
      return `尚未生成应收，参考剩余 ${formatCents(suggestion.suggestedAmountCents)}`
    }
    return `尚未生成应收，参考路径金额 ${formatCents(suggestion.suggestedAmountCents)}`
  }
  if (suggestion.existingUnallocatedCents > 0 && suggestion.pathAmountCents != null) {
    return `参考剩余 ${formatCents(suggestion.suggestedAmountCents)}（节点约定 ${formatCents(suggestion.pathAmountCents)}）`
  }
  const unsettled = formatCents(suggestion.suggestedAmountCents)
  if (suggestion.pathAmountCents != null) {
    return `未结清 ${unsettled}（节点约定 ${formatCents(suggestion.pathAmountCents)}）`
  }
  return `未结清 ${unsettled}`
}

/** 汇总同客源单上应计入建议扣减的未核销游客代收流水。 */
export function sumExistingUnallocatedGuestCents(params: {
  transactions: Array<{
    id: string
    direction: string
    counterpartyType: string
    counterpartyId: string | null
    voidedAt: string | null
    unallocatedAmountCents: number
  }>
  sourceOrderId: string
  excludeTransactionId?: string
}): number {
  return params.transactions.reduce((sum, item) => {
    if (params.excludeTransactionId && item.id === params.excludeTransactionId) {
      return sum
    }
    if (item.voidedAt != null) {
      return sum
    }
    if (item.direction !== 'inflow') {
      return sum
    }
    if (item.counterpartyType !== 'guest') {
      return sum
    }
    if (item.counterpartyId !== params.sourceOrderId) {
      return sum
    }
    return sum + Math.max(0, item.unallocatedAmountCents)
  }, 0)
}
