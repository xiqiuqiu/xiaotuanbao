import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { ExecutionTab } from './ExecutionTab'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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
  resourceCount: 1,
  outsourceCount: 0,
  resourceAmountCents: 300000,
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
  generatePayablesForDeparture: vi.fn(),
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

  it('keeps 行程段 and 资源安排 side-by-side in one nowrap row', async () => {
    renderExecutionTab()

    const segmentTitle = await screen.findByText('行程段')
    const resourceTitle = await screen.findByText('资源安排')

    const segmentCard = segmentTitle.closest('.ant-card')
    const resourceCard = resourceTitle.closest('.ant-card')
    expect(segmentCard).toBeTruthy()
    expect(resourceCard).toBeTruthy()

    const segmentCol = segmentCard!.parentElement
    const resourceCol = resourceCard!.parentElement
    expect(segmentCol?.className).toContain('ant-col')
    expect(resourceCol?.className).toContain('ant-col')

    const row = segmentCol?.parentElement
    expect(row).toBe(resourceCol?.parentElement)
    expect(row?.className).toContain('ant-row')
    expect(row?.className).toContain('ant-row-no-wrap')
  })

  it('puts segment and resource panes in a fixed-height scroll workspace', async () => {
    const { container } = renderExecutionTab()

    expect(await screen.findByText('行程段')).toBeInTheDocument()

    const workspace = container.querySelector('[class*="workspace"]')
    expect(workspace).toBeTruthy()

    const segmentCard = screen.getByText('行程段').closest('.ant-card')
    expect(segmentCard?.className).toMatch(/paneCard/)
    expect(segmentCard?.querySelector('[class*="paneCardBody"]')).toBeTruthy()

    const selected = container.querySelector('[data-segment-id="segment-1"]')
    expect(selected).toBeTruthy()
  })

  it('does not render 模板 badge on segment nav cards', async () => {
    renderExecutionTab()

    expect(await screen.findByText('西栅夜游')).toBeInTheDocument()
    expect(screen.queryByText('模板')).not.toBeInTheDocument()
  })

  it('pins 添加 under the segment list and puts 一键生成应付 in the segment card header', async () => {
    renderExecutionTab()

    const segmentTitle = await screen.findByText('行程段')
    const segmentCard = segmentTitle.closest('.ant-card')
    expect(segmentCard).toBeTruthy()

    const generateBtn = screen.getByRole('button', { name: '一键生成应付' })
    expect(segmentCard!.querySelector('.ant-card-extra')).toContainElement(generateBtn)

    const addBtn = screen.getByRole('button', { name: '添加' })
    const footer = addBtn.closest('[class*="segmentListFooter"]')
    expect(footer).toBeTruthy()
    expect(segmentCard).toContainElement(footer)

    const segmentList = footer!.parentElement
    expect(segmentList?.className).toMatch(/segmentList/)
    expect(segmentList?.lastElementChild).toBe(footer)
  })
})
