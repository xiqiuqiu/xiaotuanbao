import { useState } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary } from '@/types/api'
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

const day1: ItinerarySegmentSummary = {
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
}

const day2: ItinerarySegmentSummary = {
  id: 'segment-2',
  departureId: 'departure-1',
  name: '东栅晨游',
  sortOrder: 1,
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  dayCount: 1,
  destination: '乌镇东栅',
  notes: null,
  fullTicketCount: 0,
  halfTicketCount: 0,
  studentTicketCount: 0,
  freeTicketCount: 0,
  hasTicketHeadcountMismatch: false,
  pendingCheck: true,
  resourceCount: 2,
  outsourceCount: 0,
  resourceAmountCents: 180000,
  payableGeneratedCount: 1,
  payableStatus: 'partially_paid',
}

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(async () => ({
    items: [day1, day2],
    summary: {
      segmentCount: 2,
      totalDays: 2,
      resourceCount: 3,
      payableOverview: 'partially_paid',
    },
    total: 2,
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

vi.mock('@/services/departure-resource.service', () => ({
  listDepartureResources: vi.fn(async () => ({ items: [], total: 0 })),
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

describe('ExecutionTab day axis ↔ URL segmentId sync', () => {
  beforeEach(() => {
    searchState = { tab: 'execution', segmentId: 'segment-1' }
    navigate.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a horizontal day axis instead of the vertical segment list title', async () => {
    renderHarness()

    const axis = await screen.findByRole('region', { name: '按日资源' })
    expect(within(axis).getByText('西栅夜游')).toBeInTheDocument()
    expect(within(axis).getByText('东栅晨游')).toBeInTheDocument()
    expect(within(axis).getByText('待检查')).toBeInTheDocument()
    expect(screen.queryByText('行程段')).not.toBeInTheDocument()
  })

  it('selecting another day updates URL segmentId and keeps the card selected', async () => {
    const user = userEvent.setup()
    renderHarness()

    const axis = await screen.findByRole('region', { name: '按日资源' })
    const day2Card = within(axis).getByRole('button', { name: 'D2 东栅晨游' })

    await user.click(day2Card)

    await waitFor(() => {
      expect(searchState.segmentId).toBe('segment-2')
    })

    expect(day2Card).toHaveAttribute('aria-pressed', 'true')
    const day1Card = within(axis).getByRole('button', { name: 'D1 西栅夜游' })
    expect(day1Card).toHaveAttribute('aria-pressed', 'false')
  })

  it('restores the selected day from URL segmentId on refresh', async () => {
    searchState = { tab: 'execution', segmentId: 'segment-2' }
    renderHarness()

    const axis = await screen.findByRole('region', { name: '按日资源' })
    const day2Card = within(axis).getByRole('button', { name: 'D2 东栅晨游' })
    const day1Card = within(axis).getByRole('button', { name: 'D1 西栅夜游' })

    expect(day2Card).toHaveAttribute('aria-pressed', 'true')
    expect(day1Card).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('[data-segment-id="segment-2"]')).toBeTruthy()
  })
})
