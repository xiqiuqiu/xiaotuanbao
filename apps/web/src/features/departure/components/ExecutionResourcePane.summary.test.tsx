import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartureStatus, SegmentPayableStatus } from '@xiaotuanbao/shared'
import type {
  DepartureDetail,
  ItinerarySegmentSummary,
  SegmentResourceSummary,
} from '@/types/api'
import { ExecutionResourcePane } from './ExecutionResourcePane'

const listSegmentResources = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/segment-resource.service', () => ({
  listSegmentResources: (...args: unknown[]) => listSegmentResources(...args),
  createSegmentResource: vi.fn(),
  updateSegmentResource: vi.fn(),
  deleteSegmentResource: vi.fn(),
  generatePayable: vi.fn(),
  generatePayablesForSegment: vi.fn(),
}))

vi.mock('./ResourceDrawer', () => ({
  ResourceDrawer: () => null,
}))

const segment: ItinerarySegmentSummary = {
  id: 'segment-1',
  departureId: 'departure-1',
  name: '天山天池',
  sortOrder: 0,
  startDate: '2026-07-25',
  endDate: '2026-07-25',
  dayCount: 1,
  destination: '天山天池',
  notes: null,
  pendingCheck: false,
  resourceCount: 2,
  outsourceCount: 0,
  resourceAmountCents: 1_120_000,
  payableGeneratedCount: 0,
  payableStatus: SegmentPayableStatus.NOT_GENERATED,
}

function baseResource(
  overrides: Partial<SegmentResourceSummary> = {},
): SegmentResourceSummary {
  return {
    id: 'resource-1',
    segmentId: 'segment-1',
    departureId: 'departure-1',
    resourceKind: 'vehicle',
    counterpartyType: 'supplier',
    partnerId: null,
    partnerName: null,
    supplierId: 'supplier-1',
    supplierName: '杭州中亚旅行',
    counterpartyName: '杭州中亚旅行',
    title: '天山天池用车',
    amountCents: 220_000,
    notes: null,
    pendingCheck: false,
    hasPaymentSchedule: false,
    payableStatus: SegmentPayableStatus.NOT_GENERATED,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    paymentScheduleId: null,
    financeTouched: false,
    unsettledAmountCents: null,
    createdAt: '2026-07-14T00:05:59.000Z',
    updatedAt: '2026-07-14T01:06:59.000Z',
    ...overrides,
  }
}

function renderPane(
  departureOverrides: Partial<DepartureDetail> = {},
  segmentOverrides: Partial<ItinerarySegmentSummary> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ExecutionResourcePane
          departure={
            {
              id: 'departure-1',
              departureNo: 'XTB2026070008',
              name: '天吐喀伊10日 7月25日团',
              status: DepartureStatus.EDITING,
              ...departureOverrides,
            } as DepartureDetail
          }
          segment={{ ...segment, ...segmentOverrides }}
          readOnly={false}
          canEdit
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionResourcePane amount summary', () => {
  afterEach(() => {
    cleanup()
    listSegmentResources.mockReset()
  })

  it('shows resource amount and 尚未生成应付 in the resource header', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({ id: 'r1', amountCents: 220_000 }),
        baseResource({
          id: 'r2',
          amountCents: 900_000,
          resourceKind: 'hotel',
          title: '天池酒店',
        }),
      ],
    })
    renderPane()

    const summary = await screen.findByLabelText('本段资源金额汇总')
    expect(summary.textContent).toContain('资源 2 项')
    expect(summary.textContent).toContain(
      '资源 2 项 ｜ 资源金额 ¥11,200.00 ｜ 尚未生成应付 ¥11,200.00',
    )
  })

  it('omits the summary when the segment has no resources', async () => {
    listSegmentResources.mockResolvedValue({ items: [] })
    renderPane({}, { resourceCount: 0, resourceAmountCents: 0 })

    expect(await screen.findByText('本段暂无资源')).toBeTruthy()
    expect(screen.queryByLabelText('本段资源金额汇总')).toBeNull()
  })

  it('omits 尚未生成应付 when every resource already has a payable', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: SegmentPayableStatus.PENDING,
          hasPaymentSchedule: true,
          paymentScheduleId: 'ps-1',
        }),
      ],
    })
    renderPane({}, { resourceCount: 1, payableGeneratedCount: 1 })

    const summary = await screen.findByLabelText('本段资源金额汇总')
    expect(summary.textContent).toContain('资源金额')
    expect(summary.textContent).toContain('¥2,200.00')
    expect(summary.textContent).not.toContain('尚未生成应付')
  })

  it('omits 尚未生成应付 when the departure is settled', async () => {
    listSegmentResources.mockResolvedValue({
      items: [baseResource({ amountCents: 300_000 })],
    })
    renderPane({ status: DepartureStatus.SETTLED })

    const summary = await screen.findByLabelText('本段资源金额汇总')
    expect(summary.textContent).toContain('资源金额')
    expect(summary.textContent).not.toContain('尚未生成应付')
  })
})
