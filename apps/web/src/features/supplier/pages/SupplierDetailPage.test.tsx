import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceKind, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { SupplierDetailPage } from './SupplierDetailPage'

const mockSupplier: SupplierSummary = {
  id: 'sup-1',
  name: '西湖国宾馆',
  categories: [ResourceKind.HOTEL],
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '张经理',
  contactPhone: '13800138000',
  settlementMethod: null,
  settlementCycle: null,
  settlementNotes: null,
  referenceQuoteNotes: null,
  invoiceAvailable: null,
  invoiceType: null,
  taxRate: null,
  accountName: null,
  bankName: null,
  bankAccount: null,
  businessNotes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ supplierId: 'sup-1' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/supplier.service', () => ({
  getSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  listSupplierServiceOrders: vi.fn(),
}))

const listSupplierPayables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))

vi.mock('@/services/finance.service', () => ({
  listSupplierPayables: (...args: unknown[]) => listSupplierPayables(...args),
  getSupplierPaymentScheduleSummary: vi.fn(async () => ({ groups: [] })),
  listReceivables: vi.fn(),
  listPayables: vi.fn(),
  listPartnerReceivables: vi.fn(),
  listPartnerPayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

import { getSupplier, listSupplierServiceOrders } from '@/services/supplier.service'

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SupplierDetailPage />
    </QueryClientProvider>,
  )
}

describe('SupplierDetailPage', () => {
  afterEach(() => {
    cleanup()
    useAuthStore.setState({ actionKeys: [] })
  })

  beforeEach(() => {
    // 默认按可维护目录（计调/管理员）渲染；只读用例单独覆盖。
    useAuthStore.setState({ actionKeys: ['supplier:write'] })
    vi.mocked(getSupplier).mockResolvedValue(mockSupplier)
    vi.mocked(listSupplierServiceOrders).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      summary: { resourceRowCount: 0, departureCount: 0, totalAmountCents: 0 },
    })
  })

  it('shows supplier name and opens shared edit drawer from header', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    expect(await screen.findByRole('heading', { level: 4, name: '西湖国宾馆' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回供应商列表/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(await screen.findByText('编辑供应商')).toBeInTheDocument()
    expect(screen.getByLabelText('供应商名称')).toHaveValue('西湖国宾馆')
  })

  it('hides the edit entry when 财务 lacks supplier:write but keeps读取结算信息', async () => {
    useAuthStore.setState({ actionKeys: [] })
    renderDetailPage()

    expect(await screen.findByRole('heading', { level: 4, name: '西湖国宾馆' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument()

    // 结算信息只读可见（基本信息 Tab 默认展示）。
    expect(screen.getByRole('tab', { name: '基本信息' })).toBeInTheDocument()
  })

  it('mounts the 往来账款 ledger tab and the 服务团单 fact tab (no placeholder)', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '西湖国宾馆' })

    // 三个 Tab label 齐备
    expect(screen.getByRole('tab', { name: '基本信息' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '往来账款' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '服务团单' })).toBeInTheDocument()

    // 往来账款：实装为财务账款层，走供应商应付端点，不再是占位
    await user.click(screen.getByRole('tab', { name: '往来账款' }))
    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalledWith(
        'sup-1',
        expect.any(Object),
        expect.any(AbortSignal),
      )
    })
    expect(screen.queryByText('功能建设中，暂不可用')).not.toBeInTheDocument()

    // 「合作团单」已改名为「服务团单」，并实装为业务事实层 Tab。
    expect(screen.queryByRole('tab', { name: '合作团单' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '服务团单' }))
    await waitFor(() => {
      expect(listSupplierServiceOrders).toHaveBeenCalledWith('sup-1', expect.any(Object))
    })
    await waitFor(() => {
      expect(screen.getByText('该供应商暂无服务团单资源')).toBeInTheDocument()
    })
  })
})
