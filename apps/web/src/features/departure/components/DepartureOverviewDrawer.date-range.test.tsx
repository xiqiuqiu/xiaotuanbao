import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider, Form } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ITINERARY_SEGMENT_OUT_OF_RANGE,
  type OutOfRangeItinerarySegmentConflict,
} from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { ApiError } from '@/lib/request'
import { DepartureOverviewDrawer } from './DepartureOverviewDrawer'

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn().mockResolvedValue([{ id: 'user-1', name: '王杰' }]),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))

const updateDeparture = vi.hoisted(() => vi.fn())

vi.mock('@/services/departure.service', () => ({
  updateDeparture,
}))

const mockDeparture: DepartureDetail = {
  id: 'departure-1',
  departureNo: 'XTB2026120001',
  name: '喀纳斯线 12月1日团',
  routeName: '喀纳斯线',
  routeSource: 'manual',
  sourceTemplateId: null,
  departureType: 'combined',
  startDate: '2026-12-01',
  endDate: '2026-12-02',
  dayCount: 2,
  ownerUserId: 'user-1',
  status: 'editing',
  departureProgress: 'not_started',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalGuests: 0,
  sourceOrderCount: 0,
  segmentCount: 2,
  resourceCount: 0,
  completionTags: {
    sourceOrders: '客源未录入',
    segments: '行程已录入',
    resources: '资源未安排',
    receivables: '应收未提交',
    payables: '应付未提交',
  },
  netReceivableCents: 0,
  payableCents: 0,
  estimatedMarginCents: 0,
  canPurge: true,
  grossReceivableCents: 0,
  fareAdjustmentNetCents: 0,
  discountCents: 0,
  verifiedReceivableCents: 0,
  openUnsettledReceivableCents: 0,
  verifiedPayableCents: 0,
  openUnsettledPayableCents: 0,
  unverifiedIncomeCents: 0,
  unverifiedExpenseCents: 0,
  isFinanciallySettled: false,
  archiveHistory: [],
  settlementHistory: [],
}

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onClose = vi.fn()
  const onUpdated = vi.fn()

  function Harness() {
    const [form] = Form.useForm()
    return (
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <App>
            <DepartureOverviewDrawer
              open
              departure={mockDeparture}
              form={form}
              onClose={onClose}
              onUpdated={onUpdated}
            />
          </App>
        </ConfigProvider>
      </QueryClientProvider>
    )
  }

  render(<Harness />)
  return { onClose, onUpdated }
}

describe('DepartureOverviewDrawer tour period', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    updateDeparture.mockReset()
  })

  it('does not ask the user to add days by hand after extending the tour period', async () => {
    const user = userEvent.setup()
    updateDeparture.mockResolvedValue({
      ...mockDeparture,
      endDate: '2026-12-04',
      dayCount: 4,
    })
    renderDrawer()

    await user.click(screen.getByLabelText('结束日期'))
    await user.click(await screen.findByTitle('2026-12-04'))
    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    await waitFor(() => {
      expect(updateDeparture).toHaveBeenCalled()
    })
    expect(await screen.findByText('发团信息已保存')).toBeInTheDocument()
    expect(screen.getByText(/已自动补齐未覆盖日期的一日一段/)).toBeInTheDocument()
    expect(screen.queryByText(/手工/)).not.toBeInTheDocument()
  })

  it('shows the affected itinerary segments when shortening is rejected', async () => {
    const user = userEvent.setup()
    const conflict: OutOfRangeItinerarySegmentConflict = {
      code: ITINERARY_SEGMENT_OUT_OF_RANGE,
      periodStartDate: '2026-12-01',
      periodEndDate: '2026-12-01',
      segments: [
        { id: 'day-2', name: '第2天', startDate: '2026-12-02', endDate: '2026-12-02' },
      ],
    }
    updateDeparture.mockRejectedValue(
      new ApiError(
        '保存被拒绝：存在超出新团期（2026-12-01～2026-12-01）的行程段，请先调整后再保存。第2天（2026-12-02）',
        409,
        conflict,
      ),
    )
    renderDrawer()

    await user.click(screen.getByLabelText('结束日期'))
    await user.click(await screen.findByTitle('2026-12-01'))
    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    expect(
      await screen.findByText(/保存被拒绝：存在超出新团期（2026-12-01～2026-12-01）的行程段/),
    ).toBeInTheDocument()
    expect(screen.getByText(/第2天（2026-12-02）/)).toBeInTheDocument()
  })
})
