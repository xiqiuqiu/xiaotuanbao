import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'
import type {
  PartnerOutsourceOrderListResult,
  PartnerSourceOrderListResult,
  PartnerSummary,
} from '@/types/api'
import { PartnerSourceOrdersTab } from './PartnerSourceOrdersTab'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/source-order.service', () => ({
  listPartnerSourceOrders: vi.fn(),
  getPartnerReconciliationStatement: vi.fn(),
  downloadPartnerReconciliationStatement: vi.fn(),
}))

vi.mock('@/services/partner.service', () => ({
  listPartnerOutsourceOrders: vi.fn(),
}))

import { listPartnerSourceOrders } from '@/services/source-order.service'
import { listPartnerOutsourceOrders } from '@/services/partner.service'

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

const EMPTY_SOURCE: PartnerSourceOrderListResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  summary: {
    orderCount: 0,
    totalGuests: 0,
    partnerCount: 0,
    totalGrossReceivableCents: 0,
    totalFareAdjustmentNetCents: 0,
    totalDiscountCents: 0,
    totalNetReceivableCents: 0,
    totalGuestCollectCents: 0,
  },
}

const EMPTY_OUTSOURCE: PartnerOutsourceOrderListResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  summary: { resourceRowCount: 0, departureCount: 0, totalAmountCents: 0 },
}

const SOURCE_DATA: PartnerSourceOrderListResult = {
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
      fareAdjustmentNetCents: 0,
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
    totalFareAdjustmentNetCents: 0,
    totalDiscountCents: 30000,
    totalNetReceivableCents: 220000,
    totalGuestCollectCents: 100000,
  },
}

const OUTSOURCE_DATA: PartnerOutsourceOrderListResult = {
  items: [
    {
      id: 'res-1',
      departureId: 'dep-2',
      departureNo: 'XTB2607010001',
      departureName: '阿勒泰拼出团',
      routeName: '阿勒泰线',
      departureStartDate: '2026-07-05',
      segmentId: 'seg-1',
      segmentName: '阿勒泰段',
      title: '阿勒泰拼出',
      amountCents: 800000,
      notes: '整段拼出',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  summary: { resourceRowCount: 1, departureCount: 1, totalAmountCents: 800000 },
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

function renderTabWithRerender(partner: PartnerSummary) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const view = render(
    <QueryClientProvider client={queryClient}>
      <PartnerSourceOrdersTab key={partner.id} partner={partner} />
    </QueryClientProvider>,
  )

  return {
    ...view,
    rerenderPartner: (next: PartnerSummary) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <PartnerSourceOrdersTab key={next.id} partner={next} />
        </QueryClientProvider>,
      ),
  }
}

describe('PartnerSourceOrdersTab', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(EMPTY_SOURCE)
    vi.mocked(listPartnerOutsourceOrders).mockResolvedValue(EMPTY_OUTSOURCE)
  })

  it('defaults peer partners to the outsource segment and fetches outsource orders', async () => {
    renderTab(buildPartner({ partnerKind: PartnerKind.PEER }))

    expect(screen.getByText('拼出').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
    await waitFor(() => {
      expect(listPartnerOutsourceOrders).toHaveBeenCalledWith(
        'partner-1',
        expect.any(Object),
      )
    })
    expect(listPartnerSourceOrders).not.toHaveBeenCalled()
    expect(await screen.findByText('该合作伙伴暂无拼出资源')).toBeInTheDocument()
    expect(
      screen.queryByText('该合作伙伴为纯承接方，暂无合作团单'),
    ).not.toBeInTheDocument()
  })

  it('shows source empty state for customer-direction partner without orders', async () => {
    renderTab(buildPartner())

    expect(await screen.findByText('该合作伙伴暂无客源单')).toBeInTheDocument()
    expect(screen.getByText('客源').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
  })

  it('keeps source empty when outsource has data (no auto switch)', async () => {
    vi.mocked(listPartnerOutsourceOrders).mockResolvedValue(OUTSOURCE_DATA)
    renderTab(buildPartner())

    await waitFor(() => {
      expect(screen.getByText('该合作伙伴暂无客源单')).toBeInTheDocument()
    })
    expect(screen.queryByText('阿勒泰拼出')).not.toBeInTheDocument()
  })

  it('renders source summary metrics and table rows from list result', async () => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(SOURCE_DATA)
    renderTab(buildPartner())

    expect(await screen.findByText('华东国旅 6月10日发客')).toBeInTheDocument()
    expect(screen.getByText('客源单数')).toBeInTheDocument()
    expect(screen.getByText('原始团款合计')).toBeInTheDocument()
    expect(screen.getByText('调整净额合计')).toBeInTheDocument()
    expect(screen.getByText('游客代收合计')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '关联发团' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '调整净额' })).toBeInTheDocument()
    expect(screen.getByText('喀纳斯6月团')).toBeInTheDocument()
    expect(screen.getByText('2026-06-10')).toBeInTheDocument()
    expect(screen.getByText('2/1')).toBeInTheDocument()
    expect(screen.getByText('窗口位')).toBeInTheDocument()

    const exportButton = screen.getByRole('button', { name: /导出确认单/ })
    expect(exportButton).toBeEnabled()
  })

  it('renders outsource segment without resource-kind column or export entry', async () => {
    const user = userEvent.setup()
    vi.mocked(listPartnerOutsourceOrders).mockResolvedValue(OUTSOURCE_DATA)
    renderTab(buildPartner())

    await user.click(screen.getByText('拼出'))

    expect(await screen.findByText('阿勒泰拼出')).toBeInTheDocument()
    expect(screen.getByText('拼出').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )
    expect(screen.getByText('资源行数')).toBeInTheDocument()
    expect(screen.getByText('关联发团数')).toBeInTheDocument()
    expect(screen.getByText('约定金额合计')).toBeInTheDocument()
    expect(screen.getByText('阿勒泰段')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '资源种类' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /导出确认单/ })).not.toBeInTheDocument()
    expect(listPartnerOutsourceOrders).toHaveBeenCalled()
  })

  it('opens statement drawer only from the source segment', async () => {
    vi.mocked(listPartnerSourceOrders).mockResolvedValue(SOURCE_DATA)
    renderTab(buildPartner())

    const exportButton = await screen.findByRole('button', { name: /导出确认单/ })
    exportButton.click()

    await waitFor(() => {
      expect(screen.getByText('往来账确认单')).toBeInTheDocument()
    })
    expect(screen.getByText('请先选择对账周期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导出 Excel/ })).toBeDisabled()
  })

  it('keeps the 客源/拼出 Segmented outside the flat filter card (align 往来账款)', async () => {
    renderTab(buildPartner())

    await screen.findByText('该合作伙伴暂无客源单')

    const segmentControl = screen.getByRole('radiogroup', { name: 'segmented control' })
    const departureStart = screen.getByPlaceholderText('出团日期起')
    const filterBar = departureStart.closest('.ant-card')

    expect(filterBar).toBeTruthy()
    expect(filterBar!.contains(segmentControl)).toBe(false)
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('resets segment to the new partner default when partner changes', async () => {
    const user = userEvent.setup()
    const { rerenderPartner } = renderTabWithRerender(buildPartner())

    await user.click(screen.getByText('拼出'))
    expect(screen.getByText('拼出').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-selected',
    )

    rerenderPartner(
      buildPartner({
        id: 'partner-2',
        name: '另一家',
        partnerKind: PartnerKind.GROUP_AGENT,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText('客源').closest('.ant-segmented-item')).toHaveClass(
        'ant-segmented-item-selected',
      )
    })
    await waitFor(() => {
      expect(listPartnerSourceOrders).toHaveBeenCalledWith('partner-2', expect.any(Object))
    })
  })
})
