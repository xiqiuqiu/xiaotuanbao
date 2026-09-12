import { isResourcePayableSourceType } from '../enums/payment-schedule-source-type.enum'

export type ResourceInitialPayableAnomalyCode =
  | 'cancelled'
  | 'voided'
  | 'incomplete'
  | 'amount_mismatch'

export type ResourceExistingPayableSchedule = {
  id: string
  amountCents: number
  cancelledAt: Date | string | null
  voidedAt: Date | string | null
}

export type ResourceInitialPayableResource = {
  sourceType: string
  sourceId: string
  amountCents: number
  title: string
}

export type ResourceInitialPayableClassification =
  | { status: 'ready'; amountCents: number }
  | { status: 'no_positive_amount' }
  | { status: 'complete_and_consistent'; scheduleIds: string[] }
  | {
      status: 'anomaly'
      code: ResourceInitialPayableAnomalyCode
      message: string
    }

const ANOMALY_MESSAGE: Record<ResourceInitialPayableAnomalyCode, string> = {
  cancelled: '该资源存在已取消的应付节点，不能通过助手补建或恢复。请在普通业务入口处理。',
  voided: '该资源存在已作废的应付节点，不能通过助手覆盖。请在普通业务入口处理。',
  incomplete: '该资源应付节点不完整，不能通过助手补建或覆盖。请在普通业务入口处理。',
  amount_mismatch: '该资源已有应付金额与当前约定不一致，不能通过助手覆盖。请在普通业务入口处理。',
}

function anomaly(
  code: ResourceInitialPayableAnomalyCode,
): Extract<ResourceInitialPayableClassification, { status: 'anomaly' }> {
  return { status: 'anomaly', code, message: ANOMALY_MESSAGE[code] }
}

function isPresent(value: Date | string | null | undefined): boolean {
  return value != null && value !== ''
}

/** 单资源初始应付：已有账款是否允许本次生成。取消/作废/金额不一致不自动补建。 */
export function classifyResourceInitialPayable(input: {
  resource: ResourceInitialPayableResource
  existingSchedules: readonly ResourceExistingPayableSchedule[]
}): ResourceInitialPayableClassification {
  if (!isResourcePayableSourceType(input.resource.sourceType)) {
    return anomaly('incomplete')
  }

  const amountCents = input.resource.amountCents
  const existing = input.existingSchedules

  if (existing.length === 0) {
    return amountCents > 0
      ? { status: 'ready', amountCents }
      : { status: 'no_positive_amount' }
  }

  if (existing.some((schedule) => isPresent(schedule.voidedAt))) {
    return anomaly('voided')
  }
  if (existing.some((schedule) => isPresent(schedule.cancelledAt))) {
    return anomaly('cancelled')
  }

  const active = existing.filter(
    (schedule) => !isPresent(schedule.cancelledAt) && !isPresent(schedule.voidedAt),
  )
  if (active.length !== 1) {
    return anomaly('incomplete')
  }
  if (active[0]!.amountCents !== amountCents) {
    return anomaly('amount_mismatch')
  }

  return { status: 'complete_and_consistent', scheduleIds: [active[0]!.id] }
}
