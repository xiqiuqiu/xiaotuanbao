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

  it('presents a verification as an overview and linked finance flow', async () => {
    getVerification.mockResolvedValueOnce({
      verification: {
        verificationNo: 'CLXTB202607000004',
        direction: 'receivable',
        verificationDate: '2026-07-08',
        status: 'normal',
        amountCents: 1500000,
        billUnsettledAfterCents: 804000,
        createdByName: '阿财',
        createdAt: '2026-07-15T03:20:00.000Z',
        remark: null,
        departureNo: 'XTB2026070002',
        departureName: '黄山徽州3日线 7月8日团',
      },
      transaction: {
        transactionNo: 'TXXTB20260715000004',
        direction: 'income',
        amountCents: 1500000,
        allocatedAmountCents: 1500000,
        unallocatedAmountCents: 0,
        transactionDate: '2026-07-08',
        paymentChannel: 'bank_transfer',
        counterpartyType: 'partner',
        counterpartyName: '浙旅集团杭州分公司',
        departureId: null,
      },
      schedule: {
        scheduleNo: 'ARXTB202607000002',
        direction: 'receivable',
        amountCents: 2304000,
        settledAmountCents: 1500000,
        unsettledAmountCents: 804000,
        status: 'pending',
        counterpartyType: 'partner',
        counterpartyName: '浙旅集团杭州分公司',
        departureId: null,
      },
    })

    renderWithQueryClient(
      <VerificationDetailDrawer open verificationId="verification-1" onClose={vi.fn()} />,
    )

    expect(await screen.findByRole('heading', { name: '核销概览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '核销链路' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '流水信息' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '收付款节点' })).toBeInTheDocument()
    expect(screen.getAllByText('TXXTB20260715000004')).toHaveLength(2)
    expect(screen.getAllByText('ARXTB202607000002')).toHaveLength(2)
  })
})
