export enum DepartureIncomeCommissionStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
}

export const DEPARTURE_INCOME_COMMISSION_STATUS_LABELS: Record<
  DepartureIncomeCommissionStatus,
  string
> = {
  [DepartureIncomeCommissionStatus.UNPAID]: '未付',
  [DepartureIncomeCommissionStatus.PAID]: '已付',
}
