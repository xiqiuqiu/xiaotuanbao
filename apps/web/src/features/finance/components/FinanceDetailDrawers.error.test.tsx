import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransactionDetailDrawer } from './TransactionDetailDrawer'
import { VerificationDetailDrawer } from './VerificationDetailDrawer'

const getTransaction = vi.fn()
const getVerification = vi.fn()

vi.mock('@/services/finance.service', () => ({
  getTransaction: (...args: unknown[]) => getTransaction(...args),
  getVerification: (...args: unknown[]) => getVerification(...args),
}))

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>{node}</ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('finance detail drawer query errors', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the transaction error and exposes retry and close actions', async () => {
    getTransaction
      .mockRejectedValueOnce(new Error('流水不存在'))
      .mockResolvedValueOnce({
        id: 'transaction-1',
        transactionNo: 'TX-RECOVERED',
        direction: 'income',
        amountCents: 10000,
        allocatedAmountCents: 0,
        unallocatedAmountCents: 10000,
        transactionDate: '2026-07-14',
        paymentChannel: 'bank_transfer',
        counterpartyType: 'partner',
        counterpartyName: '测试伙伴',
        departureId: null,
        departureNo: null,
        departureName: null,
        voidedAt: null,
        voidReason: null,
        notes: null,
        createdAt: '2026-07-14T00:00:00.000Z',
        verificationCount: 0,
        lastVerificationAt: null,
        verifications: [],
      })
    const onClose = vi.fn()
    renderWithQueryClient(
      <TransactionDetailDrawer open transactionId="transaction-1" onClose={onClose} />,
    )

    expect(await screen.findByText('流水详情加载失败')).toBeInTheDocument()
    expect(screen.getByText('流水不存在')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(getTransaction).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('TX-RECOVERED')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /关\s*闭/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the verification error and exposes retry and close actions', async () => {
    getVerification
      .mockRejectedValueOnce(new Error('核销记录不存在'))
      .mockResolvedValueOnce({
        verification: {
          verificationNo: 'VR-RECOVERED',
          direction: 'receivable',
          verificationDate: '2026-07-14',
          status: 'normal',
          amountCents: 1000,
          billUnsettledAfterCents: 0,
          createdByName: '王杰',
          createdAt: '2026-07-14T00:00:00.000Z',
          remark: null,
          departureNo: 'D-1',
          departureName: '测试团',
        },
        transaction: null,
        schedule: null,
      })
    const onClose = vi.fn()
    renderWithQueryClient(
      <VerificationDetailDrawer open verificationId="verification-1" onClose={onClose} />,
    )

    expect(await screen.findByText('核销详情加载失败')).toBeInTheDocument()
    expect(screen.getByText('核销记录不存在')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(getVerification).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('VR-RECOVERED')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /关\s*闭/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
