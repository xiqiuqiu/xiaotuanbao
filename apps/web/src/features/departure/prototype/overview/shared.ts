/** PROTOTYPE shared formatters for overview variants. */
import type { DepartureDetail } from '@/types/api'
import { formatCents as formatUnsignedCents } from '../../catalog'

export function formatCents(cents: number): string {
  return cents < 0 ? `-${formatUnsignedCents(Math.abs(cents))}` : formatUnsignedCents(cents)
}

export function formatPercent(numerator: number, denominator: number): string | null {
  if (denominator === 0) {
    return null
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

export function progressPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (numerator / denominator) * 100))
}

export type OverviewSnapshot = {
  totalGuests: number
  netReceivableCents: number
  costCents: number
  marginCents: number
  grossReceivableCents: number
  discountCents: number
  marginRate: string | null
  additionalIncomeNetCents: number
  settlementReceivedCents: number
  settlementReceivableCents: number
  settlementUnreceivedCents: number
  settlementRate: string | null
  guestReceivedCents: number
  guestAgreedCents: number
  guestUnreceivedCents: number
  guestRate: string | null
  resourcePaidCents: number
  resourceUnpaidCents: number
  paymentRate: string | null
  estimatedRebateCents: number
  cashNetInflowCents: number
  incomeTransactionCents: number
  expenseTransactionCents: number
}

export function buildOverviewSnapshot(departure: DepartureDetail): OverviewSnapshot {
  const stats = departure.overviewStats
  const settlementReceivableCents = stats.settlementCollectionReceivableCents
  const settlementReceivedCents = stats.settlementCollectionReceivedCents
  return {
    totalGuests: departure.totalGuests,
    netReceivableCents: departure.netReceivableCents,
    costCents: departure.payableCents,
    marginCents: departure.estimatedMarginCents,
    grossReceivableCents: departure.grossReceivableCents,
    discountCents: departure.discountCents,
    marginRate: formatPercent(departure.estimatedMarginCents, departure.netReceivableCents),
    additionalIncomeNetCents: stats.additionalIncomeNetCents,
    settlementReceivedCents,
    settlementReceivableCents,
    settlementUnreceivedCents: settlementReceivableCents - settlementReceivedCents,
    settlementRate: formatPercent(settlementReceivedCents, settlementReceivableCents),
    guestReceivedCents: stats.guestCollectionReceivedCents,
    guestAgreedCents: stats.guestCollectionAgreedCents,
    guestUnreceivedCents: stats.guestCollectionAgreedCents - stats.guestCollectionReceivedCents,
    guestRate: formatPercent(stats.guestCollectionReceivedCents, stats.guestCollectionAgreedCents),
    resourcePaidCents: stats.resourcePaidCents,
    resourceUnpaidCents: Math.max(0, departure.payableCents - stats.resourcePaidCents),
    paymentRate: formatPercent(stats.resourcePaidCents, departure.payableCents),
    estimatedRebateCents: stats.estimatedRebateCents,
    cashNetInflowCents: stats.cashNetInflowCents,
    incomeTransactionCents: stats.incomeTransactionCents,
    expenseTransactionCents: stats.expenseTransactionCents,
  }
}
