import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import type {
  DueDateRange,
  PaymentScheduleStatusFilter,
} from '../components/PaymentScheduleFilters'
import {
  collectionMethodText,
  feeCategoryText,
  feeItemText,
  sourceOrderText,
} from './payment-schedule-identity-display'

export function applyPaymentScheduleClientFilters(
  items: PaymentScheduleSummary[],
  keyword: string,
  statusFilter?: PaymentScheduleStatusFilter,
  dueDateRange?: DueDateRange,
): PaymentScheduleSummary[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return items.filter((item) => {
    if (statusFilter === 'voided' ? !item.voidedAt : statusFilter && item.status !== statusFilter) {
      return false
    }

    if (normalizedKeyword) {
      // 与单向页 placeholder 对齐：单号 + 收款方式/费用项目（及同源 title、溯源列）。
      const haystack = [
        item.scheduleNo,
        item.title,
        sourceOrderText(item),
        collectionMethodText(item),
        feeCategoryText(item),
        feeItemText(item),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(normalizedKeyword)) {
        return false
      }
    }

    if (dueDateRange?.[0] && item.dueDate < dueDateRange[0]) {
      return false
    }

    if (dueDateRange?.[1] && item.dueDate > dueDateRange[1]) {
      return false
    }

    return true
  })
}
