import { isSourceOrderReceivableSourceType } from '../enums/payment-schedule-source-type.enum'
import type { SourceOrderReceivablePathSpec } from './source-order-receivable-paths'

export type SourceOrderInitialReceivableAnomalyCode =
  | 'cancelled'
  | 'voided'
  | 'incomplete'
  | 'amount_mismatch'

export type SourceOrderExistingReceivableSchedule = {
  id: string
  sourceType: string
  amountCents: number
  cancelledAt: Date | string | null
  voidedAt: Date | string | null
}

export type SourceOrderInitialReceivableClassification =
  | { status: 'ready'; paths: SourceOrderReceivablePathSpec[] }
  | { status: 'no_positive_paths' }
  | { status: 'complete_and_consistent'; scheduleIds: string[] }
  | {
      status: 'anomaly'
      code: SourceOrderInitialReceivableAnomalyCode
      message: string
    }

const ANOMALY_MESSAGE: Record<SourceOrderInitialReceivableAnomalyCode, string> = {
  cancelled: '该客源单存在已取消的应收节点，不能通过助手补建或恢复。请在普通业务入口处理。',
  voided: '该客源单存在已作废的应收节点，不能通过助手覆盖。请在普通业务入口处理。',
  incomplete: '该客源单应收节点不完整，不能通过助手补建缺失路径。请在普通业务入口处理。',
  amount_mismatch: '该客源单已有应收金额与当前约定不一致，不能通过助手覆盖。请在普通业务入口处理。',
}

function anomaly(
  code: SourceOrderInitialReceivableAnomalyCode,
): Extract<SourceOrderInitialReceivableClassification, { status: 'anomaly' }> {
  return { status: 'anomaly', code, message: ANOMALY_MESSAGE[code] }
}

function isPresent(value: Date | string | null | undefined): boolean {
  return value != null && value !== ''
}

/** F1/F2：一张客源单的适用正金额初始应收，以及已有账款是否允许本次生成。 */
export function classifySourceOrderInitialReceivables(input: {
  expectedPaths: SourceOrderReceivablePathSpec[]
  existingSchedules: readonly SourceOrderExistingReceivableSchedule[]
}): SourceOrderInitialReceivableClassification {
  const paths = input.expectedPaths.filter((path) => path.amountCents > 0)
  const existing = input.existingSchedules.filter((schedule) =>
    isSourceOrderReceivableSourceType(schedule.sourceType),
  )

  if (existing.length === 0) {
    return paths.length === 0 ? { status: 'no_positive_paths' } : { status: 'ready', paths }
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
  const expectedByType = new Map<string, (typeof paths)[number]>(
    paths.map((path) => [path.sourceType, path]),
  )
  const activeByType = new Map(active.map((schedule) => [schedule.sourceType, schedule]))

  if (activeByType.size !== active.length) {
    return anomaly('incomplete')
  }
  if (active.length !== paths.length) {
    return anomaly('incomplete')
  }

  for (const path of paths) {
    const match = activeByType.get(path.sourceType)
    if (!match) {
      return anomaly('incomplete')
    }
    if (match.amountCents !== path.amountCents) {
      return anomaly('amount_mismatch')
    }
  }

  for (const schedule of active) {
    if (!expectedByType.has(schedule.sourceType)) {
      return anomaly('incomplete')
    }
  }

  return { status: 'complete_and_consistent', scheduleIds: active.map((schedule) => schedule.id) }
}
