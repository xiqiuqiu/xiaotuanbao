import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'
import type { PartnerSummary } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { PartnerDetailPage } from './PartnerDetailPage'

const mockPartner: PartnerSummary = {
  id: 'partner-1',
  name: '华东国旅',
  partnerKind: PartnerKind.GROUP_AGENT,
  partnerType: PartnerType.GROUP_AGENCY,
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '王经理',
  contactRole: null,
  contactPhone: '13800138000',
  settlementMethod: null,
  paymentTermRule: null,
  settlementNotes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ partnerId: 'partner-1' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/partner.service', () => ({
  getPartner: vi.fn(),
  updatePartner: vi.fn(),
  listPartnerOutsourceOrders: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    summary: { resourceRowCount: 0, departureCount: 0, totalAmountCents: 0 },
  })),
}))

vi.mock('@/services/source-order.service', () => ({
  listPartnerSourceOrders: vi.fn(),
}))

const listPartnerReceivables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))
const listPartnerPayables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))

vi.mock('@/services/finance.service', () => ({
  listPartnerReceivables: (...args: unknown[]) => listPartnerReceivables(...(args as [])),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...(args as [])),
  listReceivables: vi.fn(),
  listPayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
  listFinancePartnerOptions: vi.fn(async () => []),
  listFinanceSupplierOptions: vi.fn(async () => []),
  listFinanceSourceOrderOptions: vi.fn(async () => []),
  getPartnerPaymentScheduleSummary: vi.fn(async () => ({ groups: [] })),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

import { getPartner } from '@/services/partner.service'
import { listPartnerSourceOrders } from '@/services/source-order.service'

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PartnerDetailPage />
    </QueryClientProvider>,
  )
}

describe('PartnerDetailPage', () => {
  afterEach(() => {
    cleanup()
    useAuthStore.setState({ actionKeys: [] })
  })

  beforeEach(() => {
    // 默认按可维护目录（计调/管理员）渲染；只读用例单独覆盖。
    useAuthStore.setState({ actionKeys: ['partner:write'] })
    vi.mocked(getPartner).mockResolvedValue(mockPartner)
    vi.mocked(listPartnerSourceOrders).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      summary: {
        orderCount: 0,
        totalGuests: 0,
        partnerCount: 0,
        totalGrossReceivableCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 0,
        totalGuestCollectCents: 0,
      },
    })
  })

  it('places edit inside 基础信息 Descriptions extra and opens the shared drawer', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    expect(await screen.findByRole('heading', { level: 4, name: '华东国旅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回合作伙伴列表/ })).toBeInTheDocument()

    const editButton = screen.getByRole('button', { name: /编辑/ })
    const basicsHeader = screen.getByText('基础信息').closest('.ant-descriptions-header')
    expect(basicsHeader).toContainElement(editButton)

    // 编辑只属于基本信息：切走后不应残留在页头
    await user.click(screen.getByRole('tab', { name: '往来账款' }))
    expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '基本信息' }))
    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(await screen.findByText('编辑合作伙伴')).toBeInTheDocument()
    expect(screen.getByLabelText('合作伙伴名称')).toHaveValue('华东国旅')
  })

  it('hides the edit entry when 财务 lacks partner:write but keeps the ledger tab', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({ actionKeys: [] })
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })
    expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument()

    // 往来账款 Tab 不受 partner:write 限制，照常可用。
    await user.click(screen.getByRole('tab', { name: '往来账款' }))
    expect(await screen.findByText('应收')).toBeInTheDocument()
  })

  it('defaults to receivable on the accounts tab and switches to payable via Segmented', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })

    await user.click(screen.getByRole('tab', { name: '往来账款' }))

    expect(await screen.findByText('应收')).toBeInTheDocument()
    expect(
      screen.getByText('应收').closest('.ant-segmented-item'),
    ).toHaveClass('ant-segmented-item-selected')

    // 默认只挂载应收 Workspace，不并行请求应付
    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalledWith(
        'partner-1',
        expect.anything(),
        expect.anything(),
      )
    })
    expect(listPartnerPayables).not.toHaveBeenCalled()

    await user.click(screen.getByText('应付'))
    expect(
      screen.getByText('应付').closest('.ant-segmented-item'),
    ).toHaveClass('ant-segmented-item-selected')
    await waitFor(() => {
      expect(listPartnerPayables).toHaveBeenCalledWith(
        'partner-1',
        expect.anything(),
        expect.anything(),
      )
    })
  })

  it('renders source orders tab with empty state when partner has no data', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })

    await user.click(screen.getByRole('tab', { name: '合作团单' }))
    await waitFor(() => {
      expect(screen.getByText('该合作伙伴暂无客源团单')).toBeInTheDocument()
    })
  })
})
