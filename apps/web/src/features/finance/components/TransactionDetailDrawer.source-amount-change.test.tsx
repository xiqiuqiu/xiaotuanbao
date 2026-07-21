import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { TransactionDetailDrawer } from './TransactionDetailDrawer'

const getTransaction = vi.fn()
const acknowledgeTransactionSourceAmountChange = vi.fn()

vi.mock('@/services/finance.service', () => ({
  getTransaction: (...args: unknown[]) => getTransaction(...args),
  acknowledgeTransactionSourceAmountChange: (...args: unknown[]) =>
    acknowledgeTransactionSourceAmountChange(...args),
}))

vi.mock('./FinanceDepartureLink', () => ({
  FinanceDepartureLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (selector: (state: { menuKeys: string[] }) => unknown) =>
    selector({ menuKeys: ['/finance/receivable', '/finance/transactions'] }),
}))

describe('TransactionDetailDrawer source amount change', () => {
  afterEach(() => {
    cleanup()
    getTransaction.mockReset()
    acknowledgeTransactionSourceAmountChange.mockReset()
  })

  it('shows acknowledge action and calls acknowledge API', async () => {
    const user = userEvent.setup()
    getTransaction.mockResolvedValue({
      id: 'tx-1',
      transactionNo: 'TX202607000001',
      direction: TransactionDirection.INFLOW,
      paymentChannel: 'bank_transfer',
      amountCents: 50000,
      allocatedAmountCents: 0,
      unallocatedAmountCents: 50000,
      transactionDate: '2026-07-15',
      counterpartyType: 'guest',
      counterpartyId: 'so-1',
      counterpartyName: '杭州同行',
      departureId: 'dep-1',
      departureNo: 'XTB2026070001',
      departureName: '乌镇一团',
      voidedAt: null,
      voidReason: null,
      notes: null,
      sourceAmountChanged: true,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      verificationCount: 0,
      lastVerificationAt: null,
      verifications: [],
    })
    acknowledgeTransactionSourceAmountChange.mockResolvedValue({
      id: 'tx-1',
      sourceAmountChanged: false,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <TransactionDetailDrawer open transactionId="tx-1" onClose={vi.fn()} />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('关联客源金额已变更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '已知悉' }))

    await waitFor(() =>
      expect(acknowledgeTransactionSourceAmountChange).toHaveBeenCalledWith('tx-1'),
    )
  })
})
