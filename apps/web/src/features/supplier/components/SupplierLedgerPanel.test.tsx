import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { SupplierLedgerPanel } from './SupplierLedgerPanel'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listSupplierPayables = vi.fn()
const listPartnerReceivables = vi.fn()
const listPartnerPayables = vi.fn()
const listReceivables = vi.fn()
const listPayables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listSupplierPayables: (...args: unknown[]) => listSupplierPayables(...args),
  getSupplierPaymentScheduleSummary: vi.fn(async () => ({ groups: [] })),
  listPartnerReceivables: (...args: unknown[]) => listPartnerReceivables(...args),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...args),
  listReceivables: (...args: unknown[]) => listReceivables(...args),
  listPayables: (...args: unknown[]) => listPayables(...args),
  listDepartureReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

const openPayable: PaymentScheduleSummary = {
  id: 'sch-1',
  departureId: 'dep-1',
  departureStatus: 'in_progress',
  direction: 'payable',
  scheduleNo: 'PS-0001',
  title: '西湖国宾馆住宿款',
  amountCents: 100000,
  dueDate: '2026-07-20',
  counterpartyType: 'supplier',
  counterpartyId: 'sup-1',
  counterpartyName: '西湖国宾馆',
  sourceType: 'manual',
  sourceId: null,
  status: 'pending',
  financeTouched: false,
  settledAmountCents: 0,
  unsettledAmountCents: 100000,
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
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SupplierLedgerPanel supplierId="sup-1" />
    </QueryClientProvider>,
  )
}

describe('SupplierLedgerPanel', () => {
  afterEach(() => {
    cleanup()
    useAuthStore.setState({ menuKeys: [] })
  })

  beforeEach(() => {
    listSupplierPayables.mockReset()
    listSupplierPayables.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
    listPartnerReceivables.mockReset()
    listPartnerPayables.mockReset()
    listReceivables.mockReset()
    listPayables.mockReset()
    // 默认按财务角色（可写）渲染；只读用例单独覆盖。
    useAuthStore.setState({ menuKeys: ['/finance/receivable', '/supplier'] })
  })

  it('renders payables only: no receivable/payable segmented control, no receivable endpoints', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({ page: 1, pageSize: 10 }),
        expect.any(AbortSignal),
      )
    })

    // 无应收/应付切换
    expect(
      screen.queryByRole('radiogroup', { name: 'segmented control' }),
    ).not.toBeInTheDocument()
    // 精确过滤走路径参数，不携带 counterparty keyword
    expect(listSupplierPayables.mock.calls[0]![1]).not.toHaveProperty('counterpartyKeyword')
    // 只调用应付端点，不触碰应收/合作伙伴端点
    expect(listPartnerReceivables).not.toHaveBeenCalled()
    expect(listPartnerPayables).not.toHaveBeenCalled()
    expect(listReceivables).not.toHaveBeenCalled()
    expect(listPayables).not.toHaveBeenCalled()
  })

  it('lays out all ledger filters flat without expand/collapse', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalled()
    })

    expect(screen.getByPlaceholderText('出团日期起')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索应付单号 / 费用项目')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '应付状态' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*置/ })).toBeInTheDocument()
    // 应付无到期日筛
    expect(screen.queryByPlaceholderText('到期日起')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('renders finance action buttons when the user can mutate finance', async () => {
    listSupplierPayables.mockResolvedValue({
      items: [openPayable],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    renderPanel()

    expect(
      await screen.findByRole('button', { name: '登记付款' }, { timeout: 15000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '匹配流水' })).toBeInTheDocument()
  }, 20000)

  it('hides finance action buttons for non-finance (read-only) roles', async () => {
    useAuthStore.setState({ menuKeys: ['/supplier'] })
    listSupplierPayables.mockResolvedValue({
      items: [openPayable],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    renderPanel()

    // 账款仍可见
    expect(
      await screen.findByText('西湖国宾馆住宿款', undefined, { timeout: 15000 }),
    ).toBeInTheDocument()
    // 但无任何财务操作入口
    expect(screen.queryByRole('button', { name: '登记付款' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '匹配流水' })).not.toBeInTheDocument()
  }, 20000)
})
