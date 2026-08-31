import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
import { DepartureOperationsSheetDrawer } from './DepartureOperationsSheetDrawer'

const getDepartureOperationsSheet = vi.fn()
const downloadDepartureOperationsSheet = vi.fn()

vi.mock('@/services/departure.service', () => ({
  getDepartureOperationsSheet: (...args: unknown[]) => getDepartureOperationsSheet(...args),
  downloadDepartureOperationsSheet: (...args: unknown[]) =>
    downloadDepartureOperationsSheet(...args),
}))

const snapshot: DepartureOperationsSheetSnapshot = {
  organizationName: '测试企业',
  exportedAt: '2026-07-12T01:00:00.000Z',
  exportedByName: '王杰',
  dataStage: 'not_started',
  departure: {
    id: 'dep-1',
    departureNo: 'XTB2026070001',
    name: '运营表预览团',
    routeName: '测试线',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    dayCount: 5,
    ownerName: '王杰',
    status: 'editing',
    departureProgress: 'not_started',
    notes: '发团级备注',
  },
  sourceOrders: [],
  segments: [],
  incomeRecords: [
    {
      id: 'income-1',
      type: 'coach_sales',
      typeLabel: '车销收入',
      projectName: '车销',
      partnerSupplierName: null,
      amountCents: 12_000,
      commissionCents: 0,
      companyIncomeCents: 12_000,
      settlementComposite: 'pending_settle',
      settlementCompositeLabel: '待结算',
    },
  ],
  additionalIncomeNetCents: 12_000,
  departureResources: [],
  pendingTransactions: [],
  pendingSummary: null,
  financeSummary: { receivable: null, payable: null },
  anomalies: [],
}

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider locale={zhCN}>
        <DepartureOperationsSheetDrawer open departureId="dep-1" onClose={vi.fn()} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('DepartureOperationsSheetDrawer', () => {
  beforeEach(() => {
    getDepartureOperationsSheet.mockReset()
    downloadDepartureOperationsSheet.mockReset()
    getDepartureOperationsSheet.mockResolvedValue(snapshot)
    downloadDepartureOperationsSheet.mockResolvedValue(undefined)
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads preview and triggers excel download (#99)', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await waitFor(() => {
      expect(screen.getByText('发团与数据阶段')).toBeInTheDocument()
    })
    expect(getDepartureOperationsSheet).toHaveBeenCalledWith('dep-1')
    expect(screen.getByText('XTB2026070001')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '增收记录' })).toBeInTheDocument()
    expect(screen.getByText('增收净收益')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '项目名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '综合状态' })).toBeInTheDocument()
    expect(screen.getByText('车销')).toBeInTheDocument()
    expect(screen.getByText('待结算')).toBeInTheDocument()
    expect(screen.getAllByText('¥120.00').length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByRole('button', { name: '导出 Excel' }))
    await waitFor(() => {
      expect(downloadDepartureOperationsSheet).toHaveBeenCalledWith('dep-1')
    })
  })

  it('omits income-records section when snapshot has none', async () => {
    getDepartureOperationsSheet.mockResolvedValue({
      ...snapshot,
      incomeRecords: [],
      additionalIncomeNetCents: 0,
    })
    renderDrawer()

    await waitFor(() => {
      expect(screen.getByText('发团与数据阶段')).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: '增收记录' })).not.toBeInTheDocument()
    expect(screen.queryByText('增收净收益')).not.toBeInTheDocument()
    expect(screen.queryByText('团上收入')).not.toBeInTheDocument()
    expect(screen.queryByText('其他收入合计')).not.toBeInTheDocument()
  })
})
