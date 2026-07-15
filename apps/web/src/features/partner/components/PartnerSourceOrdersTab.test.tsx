import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'
import type { PartnerSourceOrderListResult, PartnerSummary } from '@/types/api'
import { PartnerSourceOrdersTab } from './PartnerSourceOrdersTab'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/source-order.service', () => ({
  listPartnerSourceOrders: vi.fn(),
  getPartnerReconciliationStatement: vi.fn(),
  downloadPartnerReconciliationStatement: vi.fn(),
}))

import { listPartnerSourceOrders } from '@/services/source-order.service'

function buildPartner(overrides: Partial<PartnerSummary> = {}): PartnerSummary {
  return {
    id: 'partner-1',
    name: '华东国旅',
    partnerKind: PartnerKind.GROUP_AGENT,
    partnerType: PartnerType.GROUP_AGENCY,
    status: DirectoryProfileStatus.ACTIVE,
    contactName: null,
    contactRole: null,
    contactPhone: null,
    settlementMethod: null,
    paymentTermRule: null,
    settlementNotes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const EMPTY_RESULT: PartnerSourceOrderListResult = {
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
}

const DATA_RESULT: PartnerSourceOrderListResult = {
  items: [
    {
      id: 'so-1',
      departureId: 'dep-1',
      departureNo: 'XTB2606010001',
      departureName: '喀纳斯6月团',
      routeName: '喀纳斯阿勒泰10日线',
      departureStartDate: '2026-06-10',
      displayName: '华东国旅 6月10日发客',
      guestCount: 3,
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 50000,
      grossReceivableCents: 250000,
      discountCents: 30000,
      netReceivableCents: 220000,
      partnerCollectedCents: 120000,
      guestCollectCents: 100000,
      notes: '窗口位',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  summary: {
    orderCount: 1,
    totalGuests: 3,
    partnerCount: 1,
    totalGrossReceivableCents: 250000,
    totalDiscountCents: 30000,
    totalNetReceivableCents: 220000,
    totalGuestCollectCents: 100000,
  },
}

function renderTab(partner: PartnerSummary) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PartnerSourceOrdersTab partner={partner} />
    </QueryClientProvider>,
  )
}

describe('PartnerSourceOrdersTab', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(EMPTY_RESULT)
  })

  it('shows peer-only empty state without fetching', () => {
    renderTab(buildPartner({ partnerKind: PartnerKind.PEER }))

    expect(screen.getByText('该合作伙伴为纯承接方，暂无合作团单')).toBeInTheDocument()
    expect(listPartnerSourceOrders).not.toHaveBeenCalled()
  })

  it('shows no-data empty state for customer-direction partner without orders', async () => {
    renderTab(buildPartner())

    await waitFor(() => {
      expect(screen.getByText('该合作伙伴暂无客源团单')).toBeInTheDocument()
    })
  })

  it('renders summary metrics and table rows from list result', async () => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(DATA_RESULT)
    renderTab(buildPartner())

    expect(await screen.findByText('华东国旅 6月10日发客')).toBeInTheDocument()
    expect(screen.getByText('客源单数')).toBeInTheDocument()
    expect(screen.getByText('原始团款合计')).toBeInTheDocument()
    expect(screen.getByText('游客代收合计')).toBeInTheDocument()
    expect(screen.getByText('XTB2606010001')).toBeInTheDocument()
    expect(screen.getByText('喀纳斯阿勒泰10日线')).toBeInTheDocument()
    expect(screen.getByText('2026-06-10')).toBeInTheDocument()
    expect(screen.getByText('2/1')).toBeInTheDocument()

    // 导出确认单入口（全系统唯一，位于本 Tab 工具栏）
    const exportButton = screen.getByRole('button', { name: /导出确认单/ })
    expect(exportButton).toBeEnabled()
  })

  it('opens statement drawer and guides period selection when filter is unlimited', async () => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(DATA_RESULT)
    renderTab(buildPartner())

    const exportButton = await screen.findByRole('button', { name: /导出确认单/ })
    exportButton.click()

    await waitFor(() => {
      expect(screen.getByText('往来账确认单')).toBeInTheDocument()
    })
    // 当前筛选为不限时间：先引导选区间，不发起预览请求
    expect(screen.getByText('请先选择对账周期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出 Excel/ })).toBeDisabled()
  })
})
