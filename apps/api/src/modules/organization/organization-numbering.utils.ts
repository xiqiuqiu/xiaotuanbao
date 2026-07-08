import {
  formatDepartureNo,
  formatScheduleNo,
  formatTransactionNo,
  formatVerificationNo,
  PaymentScheduleDirection,
} from '@xiaotuanbao/shared'

export function buildNumberingExamples(businessPrefix: string, periodMonth: string, periodDay: string) {
  return {
    departure: formatDepartureNo(businessPrefix, periodMonth, 1),
    receivable: formatScheduleNo(PaymentScheduleDirection.RECEIVABLE, businessPrefix, periodMonth, 1),
    payable: formatScheduleNo(PaymentScheduleDirection.PAYABLE, businessPrefix, periodMonth, 1),
    transaction: formatTransactionNo(businessPrefix, periodDay, 1),
    verification: formatVerificationNo(businessPrefix, periodMonth, 1),
  }
}
