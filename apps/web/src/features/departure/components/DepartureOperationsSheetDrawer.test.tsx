import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
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
  })

  afterEach(() => {
    cleanup()
  })

  it('loads preview and triggers excel download (#99)', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await waitFor(() => {
      expect(screen.getByText('发团与数据阶段')).toBeInTheDocument()
    })
    expect(getDepartureOperationsSheet).toHaveBeenCalledWith('dep-1')
    expect(screen.getByText('XTB2026070001')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '导出 Excel' }))
    await waitFor(() => {
      expect(downloadDepartureOperationsSheet).toHaveBeenCalledWith('dep-1')
    })
  })
})
