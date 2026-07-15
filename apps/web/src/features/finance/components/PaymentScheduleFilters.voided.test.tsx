import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PaymentScheduleFilters } from './PaymentScheduleFilters'

vi.mock('@/services/finance.service', () => ({
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

describe('PaymentScheduleFilters voided option', () => {
  it('offers 已作废 only for payables', async () => {
    const queryClient = new QueryClient()
    const onStatusChange = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <PaymentScheduleFilters
            keyword=""
            counterpartyKeyword=""
            dueDateRange={null}
            showDepartureFilter={false}
            isReceivable={false}
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

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByText('已作废'))

    expect(onStatusChange).toHaveBeenCalledWith('voided', expect.anything())
  })
})
