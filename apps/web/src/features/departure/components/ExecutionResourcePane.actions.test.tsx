import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary, SegmentResourceSummary } from '@/types/api'
import { ExecutionResourcePane } from './ExecutionResourcePane'

const listSegmentResources = vi.fn()

vi.mock('@/services/segment-resource.service', () => ({
  listSegmentResources: (...args: unknown[]) => listSegmentResources(...args),
  createSegmentResource: vi.fn(),
  updateSegmentResource: vi.fn(),
  deleteSegmentResource: vi.fn(),
  generatePayable: vi.fn(),
}))

const segment: ItinerarySegmentSummary = {
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

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  status: 'editing',
} as DepartureDetail

function baseResource(
  overrides: Partial<SegmentResourceSummary> = {},
): SegmentResourceSummary {
  return {
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
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    ...overrides,
  }
}

function renderPane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ExecutionResourcePane
          departure={departure}
          segment={segment}
          readOnly={false}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ExecutionResourcePane action buttons', () => {
  afterEach(() => {
    cleanup()
    listSegmentResources.mockReset()
  })

  it('shows 生成应付 when payable has not been created', async () => {
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    renderPane()

    expect(await screen.findByRole('button', { name: '生成应付' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
  })

  it('shows 查看 instead of 生成应付 / 重新生成 after payable is created', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'pending',
          hasPaymentSchedule: true,
          amountFieldsLocked: false,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: '生成应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
  })
})
