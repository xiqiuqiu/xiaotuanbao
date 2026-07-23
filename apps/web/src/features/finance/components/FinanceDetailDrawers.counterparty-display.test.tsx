import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
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

vi.mock('./FinanceDepartureLink', () => ({
  FinanceDepartureLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (selector: (state: { menuKeys: string[] }) => unknown) =>
    selector({ menuKeys: ['/finance/receivable', '/finance/transactions'] }),
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

function descriptionsItemValues(label: string): HTMLElement[] {
  const terms = screen.getAllByText(label)
  return terms.map((term) => {
    const item = term.closest('.ant-descriptions-item')
    if (!item) {
      throw new Error(`descriptions item not found for ${label}`)
    }
    const content = item.querySelector('.ant-descriptions-item-content')
    if (!content) {
      throw new Error(`descriptions content not found for ${label}`)
    }
    return content as HTMLElement
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('finance detail drawers counterparty display', () => {
  it('transaction detail splits 收款方式 from 往来对象', async () => {
    getTransaction.mockResolvedValue({
      id: 'tx-1',
      transactionNo: 'TXXTB20260722000003',
      direction: 'income',
      amountCents: 200000,
      allocatedAmountCents: 200000,
      unallocatedAmountCents: 0,
      transactionDate: '2026-07-22',
      paymentChannel: 'cash',
      counterpartyType: 'guest',
      counterpartyName: '福建土楼专线地接 7月25日发客',
      departureId: 'dep-1',
      departureNo: 'XTB2026070001',
      departureName: '天吐喀伊10日',
      departureStatus: null,
      voidedAt: null,
      voidReason: null,
      notes: null,
      sourceAmountChanged: false,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
      verificationCount: 1,
      lastVerificationAt: '2026-07-22T01:00:00.000Z',
      verifications: [],
    })

    renderWithQueryClient(
      <TransactionDetailDrawer open transactionId="tx-1" onClose={vi.fn()} />,
    )

    expect(await screen.findByText('TXXTB20260722000003')).toBeInTheDocument()
    expect(within(descriptionsItemValues('收款方式')[0]).getByText('游客代收')).toBeTruthy()
    expect(
      within(descriptionsItemValues('往来对象')[0]).getByText(
        '福建土楼专线地接 7月25日发客',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/游客代收\s*·/)).toBeNull()
  })

  it('verification detail splits 收款方式 from 往来对象 on flow and schedule sections', async () => {
    getVerification.mockResolvedValue({
      verification: {
        id: 'vr-1',
        verificationNo: 'CLXTB20260722000001',
        paymentScheduleId: 'sch-1',
        transactionId: 'tx-1',
        amountCents: 200000,
        verificationDate: '2026-07-22',
        status: 'normal',
        billUnsettledAfterCents: 0,
        remark: null,
        createdBy: 'u-1',
        cancelledBy: null,
        cancelReason: null,
        cancelledAt: null,
        createdAt: '2026-07-22T00:00:00.000Z',
        updatedAt: '2026-07-22T00:00:00.000Z',
        transactionNo: 'TXXTB20260722000003',
        scheduleNo: 'ARXTB20260722000001',
        direction: 'receivable',
        departureId: 'dep-1',
        departureNo: 'XTB2026070001',
        departureName: '天吐喀伊10日',
        counterpartyType: 'guest',
        counterpartyName: '福建土楼专线地接 7月25日发客',
        createdByName: '阿财',
        cancelledByName: null,
      },
      transaction: {
        id: 'tx-1',
        transactionNo: 'TXXTB20260722000003',
        direction: 'income',
        amountCents: 200000,
        allocatedAmountCents: 200000,
        unallocatedAmountCents: 0,
        transactionDate: '2026-07-22',
        paymentChannel: 'cash',
        counterpartyType: 'guest',
        counterpartyName: '福建土楼专线地接 7月25日发客',
        departureId: 'dep-1',
        departureNo: 'XTB2026070001',
        departureName: '天吐喀伊10日',
        departureStatus: null,
        voidedAt: null,
        voidReason: null,
        notes: null,
        sourceAmountChanged: false,
        createdAt: '2026-07-22T00:00:00.000Z',
        updatedAt: '2026-07-22T00:00:00.000Z',
      },
      schedule: {
        id: 'sch-1',
        departureId: 'dep-1',
        departureStatus: 'editing',
        direction: 'receivable',
        scheduleNo: 'ARXTB20260722000001',
        title: '喀纳斯环线团游客代收路径',
        amountCents: 200000,
        dueDate: '2026-07-25',
        counterpartyType: 'guest',
        counterpartyId: 'so-1',
        counterpartyName: '福建土楼专线地接 7月25日发客',
        sourceType: 'source_order_guest_collection',
        sourceId: 'so-1',
        resourceKind: null,
        resourceTitle: null,
        sourceOrderName: '福建土楼专线地接 7月25日发客',
        status: 'settled',
        financeTouched: true,
        settledAmountCents: 200000,
        unsettledAmountCents: 0,
        cancelledAt: null,
        cancelledBy: null,
        closeDisposition: null,
        cancelReason: null,
        voidedAt: null,
        voidedBy: null,
        voidedByName: null,
        voidReason: null,
        voidedAmountCents: null,
        amountAdjustedAt: null,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-22T00:00:00.000Z',
      },
    })

    renderWithQueryClient(
      <VerificationDetailDrawer open verificationId="vr-1" onClose={vi.fn()} />,
    )

    expect(await screen.findByRole('heading', { name: '流水信息' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '收付款节点' })).toBeInTheDocument()

    const methodItems = descriptionsItemValues('收款方式')
    expect(methodItems).toHaveLength(2)
    for (const item of methodItems) {
      expect(within(item).getByText('游客代收')).toBeTruthy()
    }

    const counterpartyItems = descriptionsItemValues('往来对象')
    expect(counterpartyItems).toHaveLength(2)
    for (const item of counterpartyItems) {
      expect(within(item).getByText('福建土楼专线地接 7月25日发客')).toBeTruthy()
      expect(within(item).queryByText(/游客代收/)).toBeNull()
    }
    expect(screen.queryByText(/游客代收\s*·/)).toBeNull()
  })
})
