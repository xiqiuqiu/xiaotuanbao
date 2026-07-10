import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Modal } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { SaveAsRouteTemplateModal } from './SaveAsRouteTemplateModal'

vi.mock('@/services/route-template.service', () => ({
  saveRouteTemplateFromDeparture: vi.fn(),
}))

import { saveRouteTemplateFromDeparture } from '@/services/route-template.service'

const mockDeparture: DepartureDetail = {
  id: 'departure-1',
  departureNo: 'XTB2026070001',
  name: '喀纳斯阿勒泰10日线 8月1日团',
  routeName: '喀纳斯阿勒泰10日线',
  routeSource: 'manual',
  sourceTemplateId: null,
  departureType: DepartureType.COMBINED,
  startDate: '2026-08-01',
  endDate: '2026-08-10',
  dayCount: 10,
  ownerUserId: 'user-1',
  status: 'editing',
  departureProgress: 'not_started',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalGuests: 0,
  sourceOrderCount: 0,
  segmentCount: 1,
  resourceCount: 0,
  completionTags: {
    sourceOrders: '客源未录入',
    segments: '行程已录入',
    resources: '资源未安排',
    receivables: '应收未生成',
    payables: '应付未生成',
  },
  netReceivableCents: 0,
  payableCents: 0,
  estimatedMarginCents: 0,
  grossReceivableCents: 0,
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

function renderModal(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onClose = vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <SaveAsRouteTemplateModal departure={mockDeparture} open={open} onClose={onClose} />
      </ConfigProvider>
    </QueryClientProvider>,
  )

  return { onClose }
}

describe('SaveAsRouteTemplateModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Modal.destroyAll()
  })

  beforeEach(() => {
    vi.mocked(saveRouteTemplateFromDeparture).mockResolvedValue({
      id: 'template-1',
      name: '喀纳斯阿勒泰10日线',
      defaultDayCount: 10,
      usageCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
      segmentCount: 1,
      resourceCount: 0,
    })
  })

  it('shows only route name and default day count fields', async () => {
    renderModal()

    expect(await screen.findByLabelText('路线名称')).toBeInTheDocument()
    expect(screen.getByLabelText('默认天数')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByDisplayValue('喀纳斯阿勒泰10日线')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()

    expect(screen.queryByText('保存行程段')).not.toBeInTheDocument()
    expect(screen.queryByText('保存资源配置')).not.toBeInTheDocument()
    expect(screen.queryByText('保存参考价格')).not.toBeInTheDocument()
    expect(screen.queryByText('保存客源信息')).not.toBeInTheDocument()
    expect(screen.queryByText('保存应收应付')).not.toBeInTheDocument()
    expect(screen.queryByText('保存流水核销')).not.toBeInTheDocument()
  })

  it('submits only name and defaultDayCount', async () => {
    const user = userEvent.setup()
    renderModal()

    await waitFor(() => {
      expect(screen.getByDisplayValue('喀纳斯阿勒泰10日线')).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText('路线名称')
    await user.clear(nameInput)
    await user.type(nameInput, '新路线名')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => {
      expect(saveRouteTemplateFromDeparture).toHaveBeenCalledWith('departure-1', {
        name: '新路线名',
        defaultDayCount: 10,
      })
    })
  })
})
