import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { ExecutionTab } from './ExecutionTab'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => ({ tab: 'execution', segmentId: 'segment-1' }),
}))

const mockSegment = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '西栅夜游',
  sortOrder: 0,
  startDate: '2026-07-14',
  endDate: '2026-07-14',
  dayCount: 1,
  destination: '乌镇西栅',
  notes: null,
  fullTicketCount: 0,
  halfTicketCount: 0,
  studentTicketCount: 0,
  freeTicketCount: 0,
  hasTicketHeadcountMismatch: false,
  pendingCheck: false,
  resourceCount: 1,
  outsourceCount: 0,
  resourceAmountCents: 300000,
  payableGeneratedCount: 0,
  payableStatus: 'not_generated',
  // Extra legacy field: UI must ignore even if a stale client still sends it.
  fromTemplate: true,
} as ItinerarySegmentSummary

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(async () => ({
    items: [mockSegment],
    summary: {
      segmentCount: 1,
      totalDays: 1,
      resourceCount: 1,
      payableOverview: 'not_generated',
    },
    total: 1,
  })),
  createSegment: vi.fn(),
  generateDailySegments: vi.fn(),
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
}))

vi.mock('@/services/segment-resource.service', () => ({
  listSegmentResources: vi.fn(async () => ({
    items: [
      {
        id: 'resource-1',
        segmentId: 'segment-1',
        resourceKind: 'ticket',
        counterpartyType: 'supplier',
        counterpartyId: 'supplier-1',
        counterpartyName: '乌镇西栅景区',
        title: '西栅团队票',
        amountCents: 300000,
        payableStatus: 'not_generated',
        notes: null,
        hasPaymentSchedule: false,
        amountFieldsLocked: false,
      },
    ],
  })),
  createSegmentResource: vi.fn(),
  updateSegmentResource: vi.fn(),
  deleteSegmentResource: vi.fn(),
  generatePayable: vi.fn(),
  generatePayablesForSegment: vi.fn(),
}))

vi.mock('@/services/departure-resource.service', () => ({
  listDepartureResources: vi.fn(async () => ({
    items: [
      {
        id: 'departure-resource-1',
        departureId: 'departure-1',
        resourceKind: 'vehicle',
        counterpartyType: 'supplier',
        counterpartyId: 'supplier-2',
        counterpartyName: '全程车队',
        title: '全程用车',
        amountCents: 500000,
        payableStatus: 'not_generated',
        notes: null,
        hasPaymentSchedule: false,
        amountFieldsLocked: false,
      },
    ],
    total: 1,
  })),
  createDepartureResource: vi.fn(),
  updateDepartureResource: vi.fn(),
  deleteDepartureResource: vi.fn(),
  generateDeparturePayable: vi.fn(),
}))

const mockDeparture = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  startDate: '2026-07-14',
  endDate: '2026-07-15',
  dayCount: 2,
  totalGuests: 18,
  status: 'editing',
} as DepartureDetail

function renderExecutionTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <div style={{ width: 900 }}>
          <ExecutionTab
            departure={mockDeparture}
            segmentId="segment-1"
            readOnly={false}
            canEdit
          />
        </div>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionTab layout', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows day and departure as mutually exclusive layers with a switcher', async () => {
    const user = userEvent.setup()
    renderExecutionTab()

    expect(screen.queryByRole('list', { name: '整团成本汇总' })).not.toBeInTheDocument()

    const dayLayerTab = await screen.findByRole('tab', { name: /按日资源/ })
    const departureLayerTab = screen.getByRole('tab', { name: /发团级资源/ })
    expect(dayLayerTab).toHaveAttribute('aria-selected', 'true')
    expect(departureLayerTab).toHaveAttribute('aria-selected', 'false')

    // Day layer: axis + segment resources visible; departure table hidden
    expect(screen.getByRole('region', { name: '按日资源' })).toBeInTheDocument()
    expect(await screen.findByText('西栅团队票')).toBeInTheDocument()
    expect(screen.queryByText('全程用车')).not.toBeInTheDocument()

    await user.click(departureLayerTab)

    expect(departureLayerTab).toHaveAttribute('aria-selected', 'true')
    expect(dayLayerTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('region', { name: '按日资源' })).not.toBeInTheDocument()
    expect(await screen.findByText('全程用车')).toBeInTheDocument()
    expect(screen.queryByText('西栅团队票')).not.toBeInTheDocument()

    expect(await screen.findByLabelText('发团级资源金额汇总')).toHaveTextContent(
      /资源 1 项.*资源金额.*¥5,000\.00.*尚未生成应付.*¥5,000\.00/,
    )
    expect(screen.getAllByText('合计').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the selected day resource table below the horizontal day axis', async () => {
    const { container } = renderExecutionTab()

    const dayAxis = await screen.findByRole('region', { name: '按日资源' })
    const resourceTitle = screen.getByText('资源安排')

    expect(within(dayAxis).getByText('西栅夜游')).toBeInTheDocument()
    expect(within(dayAxis).getByText('07-14')).toBeInTheDocument()
    expect(within(dayAxis).getByText('1项')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="生成 0/1"]')).toBeTruthy()

    const resourceCard = resourceTitle.closest('.ant-card')
    expect(resourceCard).toBeTruthy()
    expect(within(resourceCard as HTMLElement).getByText('批量生成应付')).toBeInTheDocument()
    expect(
      await within(resourceCard as HTMLElement).findByText('添加资源'),
    ).toBeInTheDocument()
    expect(
      dayAxis.compareDocumentPosition(resourceTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('puts day axis and resource pane in a fixed-height scroll workspace', async () => {
    const { container } = renderExecutionTab()

    expect(await screen.findByRole('region', { name: '按日资源' })).toBeInTheDocument()

    const workspace = container.querySelector('[class*="workspace"]')
    expect(workspace).toBeTruthy()

    const selected = container.querySelector('[data-segment-id="segment-1"]')
    expect(selected).toBeTruthy()

    const addBtn = screen.getByRole('button', { name: '添加一天' })
    expect(addBtn).toBeInTheDocument()
  })

  it('fills the workspace when showing the departure layer (no stacked max-height cap)', async () => {
    const user = userEvent.setup()
    renderExecutionTab()

    await user.click(await screen.findByRole('tab', { name: /发团级资源/ }))
    expect(await screen.findByText('全程用车')).toBeInTheDocument()

    const departurePaneCss = readFileSync(
      resolve(__dirname, './DepartureResourcePane.module.css'),
      'utf8',
    )
    expect(departurePaneCss).toMatch(/\.pane\s*\{[^}]*flex:\s*1\s+1\s+auto/)
    expect(departurePaneCss).not.toMatch(/max-height:\s*38%/)

    const executionCss = readFileSync(resolve(__dirname, './ExecutionTab.module.css'), 'utf8')
    expect(executionCss).toMatch(/\.workspace\s*\{[^}]*overflow:\s*hidden/)
    expect(executionCss).toMatch(/\.layerSwitch\s*\{/)
  })

  it('opens the departure layer when locating a departure resource', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <ExecutionTab
            departure={mockDeparture}
            segmentId="segment-1"
            highlightDepartureResourceId="departure-resource-1"
            readOnly={false}
            canEdit
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('tab', { name: /发团级资源/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByText('全程用车')).toBeInTheDocument()
  })

  it('does not render 模板 badge on day cards', async () => {
    renderExecutionTab()

    expect(await screen.findByText('西栅夜游')).toBeInTheDocument()
    expect(screen.queryByText('模板')).not.toBeInTheDocument()
  })

  it('keeps day selection and editing as separate keyboard actions', async () => {
    const user = userEvent.setup()
    const { container } = renderExecutionTab()

    const selectButton = await screen.findByRole('button', { name: 'D1 西栅夜游' })
    const editButton = screen.getByRole('button', { name: '编辑西栅夜游' })

    expect(container.querySelector('[role="button"] button')).toBeNull()
    expect(container.querySelector('button button')).toBeNull()

    mockNavigate.mockClear()
    selectButton.focus()
    await user.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledTimes(1)

    mockNavigate.mockClear()
    editButton.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('编辑行程段')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
