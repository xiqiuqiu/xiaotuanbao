import { DepartureIncomeCollectionStatus } from './departure-income-collection-status.enum'
import { DepartureIncomeCommissionStatus } from './departure-income-commission-status.enum'

/** 派生展示态，不单独落库（ADR-0036 / PRD）。 */
export enum DepartureIncomeSettlementComposite {
  PENDING_SETTLE = 'pending_settle',
  PENDING_COMMISSION = 'pending_commission',
  PENDING_COLLECT = 'pending_collect',
  SETTLED = 'settled',
}

export const DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS: Record<
  DepartureIncomeSettlementComposite,
  string
> = {
  [DepartureIncomeSettlementComposite.PENDING_SETTLE]: '待结算',
  [DepartureIncomeSettlementComposite.PENDING_COMMISSION]: '待付提成',
  [DepartureIncomeSettlementComposite.PENDING_COLLECT]: '待收增收',
  [DepartureIncomeSettlementComposite.SETTLED]: '已结算',
}

export function deriveDepartureIncomeSettlementComposite(input: {
  incomeStatus: DepartureIncomeCollectionStatus
  commissionStatus: DepartureIncomeCommissionStatus
}): DepartureIncomeSettlementComposite {
  if (
    input.incomeStatus === DepartureIncomeCollectionStatus.COLLECTED &&
    input.commissionStatus === DepartureIncomeCommissionStatus.PAID
  ) {
    return DepartureIncomeSettlementComposite.SETTLED
  }
  if (
    input.incomeStatus === DepartureIncomeCollectionStatus.COLLECTED &&
    input.commissionStatus === DepartureIncomeCommissionStatus.UNPAID
  ) {
    return DepartureIncomeSettlementComposite.PENDING_COMMISSION
  }
  if (
    input.incomeStatus === DepartureIncomeCollectionStatus.UNCOLLECTED &&
    input.commissionStatus === DepartureIncomeCommissionStatus.PAID
  ) {
    return DepartureIncomeSettlementComposite.PENDING_COLLECT
  }
  return DepartureIncomeSettlementComposite.PENDING_SETTLE
}

export function companyIncomeCents(input: {
  amountCents: number
  commissionCents: number
}): number {
  return input.amountCents - input.commissionCents
}
