import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { ExecutionTab } from './ExecutionTab'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const mockSegment: ItinerarySegmentSummary = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '西栅夜游',
  startDate: '2026-07-14',
  endDate: '2026-07-14',
  dayCount: 1,
  destination: '乌镇西栅',
  applicableGuestCount: 18,
  notes: null,
  fromTemplate: false,
  resourceCount: 1,
  outsourceCount: 0,
  resourceAmountCents: 300000,
  payableStatus: 'not_generated',
}

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
})
