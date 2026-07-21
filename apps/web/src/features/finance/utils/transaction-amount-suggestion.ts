import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'

export type GuestCollectionSettledHint = 'open' | 'settled' | 'no_schedule'

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
  settledHint: GuestCollectionSettledHint
}

export function resolveGuestCollectionAmountSuggestion(params: {
  schedules: GuestCollectionScheduleAmountInput[]
  guestCollectCents: number
}): GuestCollectionAmountSuggestion {
  const guestSchedules = params.schedules.filter(
    (schedule) => schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
  )
  const openSchedule =
    guestSchedules.find((schedule) => schedule.cancelledAt == null) ?? guestSchedules[0]

  if (!openSchedule) {
    return {
      suggestedAmountCents: params.guestCollectCents,
      hasSchedule: false,
      agreedAmountCents: params.guestCollectCents,
      settledHint: 'no_schedule',
    }
  }

  const unsettled = openSchedule.unsettledAmountCents
  return {
    suggestedAmountCents: unsettled,
    hasSchedule: true,
    pathAmountCents: openSchedule.amountCents,
    agreedAmountCents: params.guestCollectCents,
    settledHint: unsettled === 0 ? 'settled' : 'open',
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
  if (suggestion.settledHint === 'no_schedule') {
    return `尚未生成应收，参考路径金额 ${formatCents(suggestion.suggestedAmountCents)}`
  }
  const unsettled = formatCents(suggestion.suggestedAmountCents)
  if (suggestion.pathAmountCents != null) {
    return `未结清 ${unsettled}（节点约定 ${formatCents(suggestion.pathAmountCents)}）`
  }
  return `未结清 ${unsettled}`
}
