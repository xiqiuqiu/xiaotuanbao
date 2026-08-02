/**
 * 发团详情各 Tab 筛选条应统一提供「查询」+「重置」。
 */
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceOrdersFilters } from '@/features/departure/components/SourceOrdersFilters'
import { IncomeRecordsFilters } from '@/features/departure/components/IncomeRecordsFilters'
import { PaymentScheduleFilters } from '@/features/finance/components/PaymentScheduleFilters'
import { TransactionFilters } from '@/features/finance/components/TransactionFilters'
import { VerificationFilters } from '@/features/finance/components/VerificationFilters'
import { EMPTY_SOURCE_ORDER_FILTERS } from '@/features/departure/utils/source-order-filter-state'
import {
  getDefaultTransactionDateRange,
  getDefaultVerificationDateRange,
} from '@/features/finance/utils/date-ranges'

afterEach(() => {
  cleanup()
})

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function expectSearchAndReset() {
  // antd Button 默认 autoInsertSpace，accessible name 可能是「查 询」
  expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /重\s*置/ })).toBeInTheDocument()
}

describe('发团详情 Tab 筛选条：查询 + 重置统一', () => {
  it('客源管理筛选有查询与重置', () => {
    render(
      <SourceOrdersFilters
        draft={EMPTY_SOURCE_ORDER_FILTERS}
        partnerOptions={[]}
        onDraftChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expectSearchAndReset()
  })

  it('增收记录筛选有查询与重置', () => {
    render(
      <IncomeRecordsFilters
        typeFilter="all"
        compositeFilter="all"
        keyword=""
        onTypeChange={vi.fn()}
        onCompositeChange={vi.fn()}
        onKeywordChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expectSearchAndReset()
  })

  it('应收/应付筛选有查询与重置', () => {
    withQuery(
      <PaymentScheduleFilters
        scope="departure"
        isReceivable
        keyword=""
        counterpartyKeyword=""
        dueDateRange={null}
        onDepartureChange={vi.fn()}
        onStatusChange={vi.fn()}
        onKeywordChange={vi.fn()}
        onCounterpartyKeywordChange={vi.fn()}
        onDueDateRangeChange={vi.fn()}
        onReset={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expectSearchAndReset()
  })

  it('收支流水筛选有查询与重置', () => {
    withQuery(
      <TransactionFilters
        scope="departure"
        dateRange={getDefaultTransactionDateRange()}
        partnerKeyword=""
        transactionNo=""
        onDateRangeChange={vi.fn()}
        onDirectionChange={vi.fn()}
        onPartnerKeywordChange={vi.fn()}
        onWriteoffStatusChange={vi.fn()}
        onTransactionNoChange={vi.fn()}
        onDepartureChange={vi.fn()}
        onStatusChange={vi.fn()}
        onReset={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expectSearchAndReset()
  })

  it('核销记录筛选有查询与重置', () => {
    render(
      <VerificationFilters
        scope="departure"
        dateRange={getDefaultVerificationDateRange()}
        transactionNo=""
        scheduleNo=""
        departureKeyword=""
        onDateRangeChange={vi.fn()}
        onDirectionChange={vi.fn()}
        onStatusChange={vi.fn()}
        onTransactionNoChange={vi.fn()}
        onScheduleNoChange={vi.fn()}
        onDepartureKeywordChange={vi.fn()}
        onReset={vi.fn()}
        onApply={vi.fn()}
      />,
    )
    expectSearchAndReset()
  })
})
