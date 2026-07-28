import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
import { createSegment, listSegments } from '@/services/segment.service'
import { ExecutionTab } from './ExecutionTab'

type SearchState = {
  tab: string
  segmentId?: string
}

let searchState: SearchState = { tab: 'execution', segmentId: 'segment-1' }
const navigate = vi.fn(
  (opts: { search?: { segmentId?: string; tab?: string }; replace?: boolean }) => {
    searchState = {
      tab: opts.search?.tab ?? 'execution',
      segmentId: opts.search?.segmentId,
    }
  },
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => searchState,
}))

const existingSegment: ItinerarySegmentSummary = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '喀纳斯',
  sortOrder: 0,
  startDate: '2026-07-13',
  endDate: '2026-07-15',
  dayCount: 3,
  destination: null,
  notes: null,
  pendingCheck: false,
  resourceCount: 2,
  outsourceCount: 0,
  resourceAmountCents: 568000,
  payableGeneratedCount: 1,
  payableStatus: 'partially_paid',
}

const createdSegment: ItinerarySegmentSummary = {
  id: 'segment-new',
  departureId: 'departure-1',
  name: '新建段',
  sortOrder: 1,
  startDate: null,
  endDate: null,
  dayCount: 0,
  destination: null,
  notes: null,
  pendingCheck: false,
  resourceCount: 0,
  outsourceCount: 0,
  resourceAmountCents: 0,
  payableGeneratedCount: 0,
  payableStatus: 'not_generated',
}

/** Stale list until we explicitly include the created segment — models
 *  the window after create where URL already has the new id but the
 *  segments query cache has not yet returned it. */
let segmentItems: ItinerarySegmentSummary[] = [existingSegment]

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(async () => ({
    items: segmentItems,
    summary: {
      segmentCount: segmentItems.length,
      totalDays: segmentItems.reduce((sum, s) => sum + s.dayCount, 0),
      resourceCount: segmentItems.reduce((sum, s) => sum + s.resourceCount, 0),
      payableOverview: 'partially_paid',
    },
    total: segmentItems.length,
  })),
  createSegment: vi.fn(async () => {
    // Real API would persist first; list refetch then includes the new row.
    // Keep this delayed until after the mutation resolves so the stale-cache
    // window still exists for the first paint after navigate.
    queueMicrotask(() => {
      segmentItems = [existingSegment, createdSegment]
    })
    return createdSegment
  }),
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
  departureNo: 'XBZL2026070008',
  name: 'D线 乌鲁木齐-喀纳斯 10日游',
  startDate: '2026-07-13',
  endDate: '2026-07-22',
  dayCount: 10,
  totalGuests: 18,
  status: 'editing',
} as DepartureDetail

function Harness() {
  const [segmentId, setSegmentId] = useState(searchState.segmentId)

  navigate.mockImplementation(
    (opts: { search?: { segmentId?: string; tab?: string }; replace?: boolean }) => {
      searchState = {
        tab: opts.search?.tab ?? 'execution',
        segmentId: opts.search?.segmentId,
      }
      setSegmentId(opts.search?.segmentId)
    },
  )

  return (
    <ExecutionTab
      departure={mockDeparture}
      segmentId={segmentId}
      readOnly={false}
      canEdit
    />
  )
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <Harness />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionTab create → select new segment', () => {
  beforeEach(() => {
    searchState = { tab: 'execution', segmentId: 'segment-1' }
    segmentItems = [existingSegment]
    navigate.mockClear()
    vi.mocked(createSegment).mockClear()
    vi.mocked(listSegments).mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the newly created segment selected after save (not fall back to first)', async () => {
    const user = userEvent.setup()
    renderHarness()

    expect(await screen.findByText('喀纳斯')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '添加' }))
    expect(await screen.findByText('添加行程段')).toBeInTheDocument()

    await user.type(screen.getByLabelText('行程段名称'), '新建段')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => {
      expect(createSegment).toHaveBeenCalled()
    })

    // After settle: URL / selection must stay on the created segment —
    // not fall back to the first (喀纳斯) while the list query catches up.
    await waitFor(() => {
      expect(searchState.segmentId).toBe('segment-new')
    })

    await waitFor(() => {
      const newNav = document.querySelector('[data-segment-id="segment-new"]')
      const firstNav = document.querySelector('[data-segment-id="segment-1"]')
      expect(newNav?.className).toMatch(/segmentItemSelected/)
      expect(firstNav?.className).not.toMatch(/segmentItemSelected/)
    })
  })
})
