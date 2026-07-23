import {
  CounterpartyType,
  RESOURCE_KIND_LABELS,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { RECEIVABLE_COLLECTION_METHOD_LABELS } from '../catalog'

const DASH = '-'

/** 应付「费用类别」：资源种类 label；非资源来源显示「-」。 */
export function feeCategoryText(schedule: PaymentScheduleSummary): string {
  if (!schedule.resourceKind) {
    return DASH
  }
  return RESOURCE_KIND_LABELS[schedule.resourceKind as never] ?? schedule.resourceKind
}

/** 应付「费用项目」：实时资源项目名，缺失回落资源种类；手工行回落节点标题。 */
export function feeItemText(schedule: PaymentScheduleSummary): string {
  if (schedule.resourceTitle) {
    return schedule.resourceTitle
  }
  if (schedule.resourceKind) {
    return RESOURCE_KIND_LABELS[schedule.resourceKind as never] ?? schedule.resourceKind
  }
  return schedule.title || DASH
}

/** 应收「来源客源单」：客源单展示名；非客源来源显示「-」。 */
export function sourceOrderText(schedule: PaymentScheduleSummary): string {
  return schedule.sourceOrderName || DASH
}

/** 应收「收款方式」：客户补款 / 游客代收；手工其他应收回落「其他」。 */
export function collectionMethodText(schedule: PaymentScheduleSummary): string {
  return RECEIVABLE_COLLECTION_METHOD_LABELS[schedule.sourceType] ?? '其他'
}

/** 收款对象 / 付款对象展示值：游客代收统一显示「游客」，其余显示对手方名称。 */
export function counterpartyText(schedule: PaymentScheduleSummary): string {
  if (schedule.counterpartyType === CounterpartyType.GUEST) {
    return '游客'
  }
  return schedule.counterpartyName || DASH
}
