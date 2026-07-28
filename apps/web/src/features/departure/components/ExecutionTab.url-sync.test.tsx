import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { ExecutionTab } from './ExecutionTab'

type SearchState = {
  tab: string
  segmentId?: string
  highlightSegmentResourceId?: string
}

const navigate = vi.fn()
const useSearch = vi.fn(
  (..._args: unknown[]): SearchState => ({ tab: 'execution', segmentId: 'segment-1' }),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: (...args: unknown[]) => useSearch(...args),
}))

const mockSegment: ItinerarySegmentSummary = {
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
  payableGeneratedCount: 1,
  payableStatus: 'pending',
}

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(async () => ({
    items: [mockSegment],
    summary: {
      segmentCount: 1,
      totalDays: 1,
      resourceCount: 1,
      payableOverview: 'pending',
    },
    total: 1,
  })),
  createSegment: vi.fn(),
  generateDailySegments: vi.fn(),
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
}))

vi.mock('@/services/segment-resource.service', () => ({
  listSegmentResources: vi.fn(async () => ({ items: [] })),
  createSegmentResource: vi.fn(),
  updateSegmentResource: vi.fn(),
  deleteSegmentResource: vi.fn(),
  generatePayable: vi.fn(),
  generatePayablesForSegment: vi.fn(),
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

function renderExecutionTab(segmentId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ExecutionTab
          departure={mockDeparture}
          segmentId={segmentId}
          readOnly={false}
          canEdit
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionTab URL sync', () => {
  afterEach(() => {
    cleanup()
    navigate.mockReset()
    useSearch.mockReset()
    useSearch.mockImplementation(() => ({ tab: 'execution', segmentId: 'segment-1' }))
  })

  it('does not force tab=execution when search already left execution (view payables race)', async () => {
    useSearch.mockImplementation(() => ({
      tab: 'payables',
      highlightSegmentResourceId: 'resource-1',
    }))

    renderExecutionTab(undefined)

    await waitFor(() => {
      expect(screen.getByText('行程段')).toBeTruthy()
    })

    expect(navigate).not.toHaveBeenCalled()
  })
})
