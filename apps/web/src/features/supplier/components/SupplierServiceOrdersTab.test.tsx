import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceKind } from '@xiaotuanbao/shared'
import type { SupplierServiceOrderListResult } from '@/types/api'
import { SupplierServiceOrdersTab } from './SupplierServiceOrdersTab'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/services/supplier.service', () => ({
  listSupplierServiceOrders: vi.fn(),
}))

import { listSupplierServiceOrders } from '@/services/supplier.service'

const EMPTY_RESULT: SupplierServiceOrderListResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  summary: { resourceRowCount: 0, departureCount: 0, totalAmountCents: 0 },
}

const DATA_RESULT: SupplierServiceOrderListResult = {
  items: [
    {
      id: 'res-1',
      departureId: 'dep-1',
      departureNo: 'XTB2606010001',
      departureName: '喀纳斯6月团',
      routeName: '喀纳斯阿勒泰10日线',
      departureStartDate: '2026-06-10',
      segmentId: 'seg-1',
      segmentName: '住宿段',
      resourceKind: ResourceKind.HOTEL,
      title: '喀纳斯山庄双床房',
      amountCents: 250000,
      notes: '窗口位',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  summary: { resourceRowCount: 1, departureCount: 1, totalAmountCents: 250000 },
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SupplierServiceOrdersTab supplierId="sup-1" />
    </QueryClientProvider>,
  )
}

describe('SupplierServiceOrdersTab', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.mocked(listSupplierServiceOrders).mockResolvedValue(EMPTY_RESULT)
  })

  it('shows a clear empty state when the supplier was never scheduled', async () => {
    renderTab()

    await waitFor(() => {
      expect(screen.getByText('该供应商暂无服务团单资源')).toBeInTheDocument()
    })
  })

  it('renders the three summary cards and business-fact columns', async () => {
    vi.mocked(listSupplierServiceOrders).mockResolvedValue(DATA_RESULT)
    renderTab()

    expect(await screen.findByText('喀纳斯山庄双床房')).toBeInTheDocument()

    // 三项汇总卡
    expect(screen.getByText('资源行数')).toBeInTheDocument()
    expect(screen.getByText('关联发团数')).toBeInTheDocument()
    expect(screen.getByText('约定金额合计')).toBeInTheDocument()

    // 业务事实列：出团日期、关联发团、行程段、资源种类、资源名称、约定金额、备注
    expect(screen.getByRole('columnheader', { name: '出团日期' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '关联发团' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '行程段' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '资源种类' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '资源名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '约定金额' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '备注' })).toBeInTheDocument()

    // 不含应付进度/状态列（归往来账款 Tab）
    expect(screen.queryByRole('columnheader', { name: '应付状态' })).not.toBeInTheDocument()

    expect(screen.getByText('2026-06-10')).toBeInTheDocument()
    expect(screen.getByText('住宿段')).toBeInTheDocument()
    expect(screen.getByText('酒店')).toBeInTheDocument()
    expect(screen.getByText('窗口位')).toBeInTheDocument()

    // 关联发团为深链
    const departureLink = screen.getByText('喀纳斯6月团').closest('a')
    expect(departureLink).toBeInTheDocument()
  })

  it('lays out the departure-date filter in a flat card without expand/collapse', async () => {
    vi.mocked(listSupplierServiceOrders).mockResolvedValue(DATA_RESULT)
    renderTab()

    const departureStart = await screen.findByPlaceholderText('出团日期起')
    expect(departureStart.closest('.ant-card')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('refetches with departureDateFrom/To when the departure date filter changes', async () => {
    vi.mocked(listSupplierServiceOrders).mockResolvedValue(DATA_RESULT)
    const user = userEvent.setup()
    renderTab()

    await waitFor(() => {
      expect(listSupplierServiceOrders).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({ departureDateFrom: undefined, departureDateTo: undefined }),
      )
    })

    await user.click(screen.getByPlaceholderText('出团日期起'))
    await user.click(await screen.findByText('本月'))

    await waitFor(() => {
      expect(listSupplierServiceOrders).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({
          departureDateFrom: expect.any(String),
          departureDateTo: expect.any(String),
        }),
      )
    })
  })
})
