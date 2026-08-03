import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentScheduleFilters } from './PaymentScheduleFilters'

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

afterEach(() => {
  cleanup()
})

function renderFilters(
  isReceivable: boolean,
  onStatusChange: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <PaymentScheduleFilters
          keyword=""
          counterpartyKeyword=""
          dueDateRange={null}
          scope="departure"
          isReceivable={isReceivable}
          onDepartureChange={vi.fn()}
          onStatusChange={onStatusChange}
          onKeywordChange={vi.fn()}
          onCounterpartyKeywordChange={vi.fn()}
          onDueDateRangeChange={vi.fn()}
          onReset={vi.fn()}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('PaymentScheduleFilters status label', () => {
  it('labels receivable status filter as 应收状态', () => {
    renderFilters(true)
    expect(screen.getByRole('combobox', { name: '应收状态' })).toBeInTheDocument()
  })

  it('labels payable status filter as 应付状态', () => {
    renderFilters(false)
    expect(screen.getByRole('combobox', { name: '应付状态' })).toBeInTheDocument()
  })
})

describe('PaymentScheduleFilters voided option', () => {
  it('offers 已作废 only for payables', async () => {
    const onStatusChange = vi.fn()
    renderFilters(false, onStatusChange)

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: '应付状态' }))
    await user.click(await screen.findByText('已作废'))

    expect(onStatusChange).toHaveBeenCalledWith('voided', expect.anything())
  })
})
