import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import type {
  DueDateRange,
  PaymentScheduleStatusFilter,
} from '../components/PaymentScheduleFilters'

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
      const haystack = `${item.scheduleNo} ${item.title}`.toLowerCase()
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
