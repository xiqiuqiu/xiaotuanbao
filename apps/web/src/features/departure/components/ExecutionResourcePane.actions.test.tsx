import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, ItinerarySegmentSummary, SegmentResourceSummary } from '@/types/api'
import { ExecutionResourcePane } from './ExecutionResourcePane'

const listSegmentResources = vi.fn()
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

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
    departureId: 'departure-1',
    resourceKind: 'ticket',
    counterpartyType: 'supplier',
    partnerId: null,
    partnerName: null,
    supplierId: 'supplier-1',
    supplierName: '乌镇西栅景区',
    counterpartyName: '乌镇西栅景区',
    title: '西栅团队票',
    amountCents: 300000,
    notes: null,
    hasPaymentSchedule: false,
    payableStatus: 'not_generated',
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
    navigate.mockReset()
  })

  it('shows 生成应付 when payable has not been created', async () => {
    listSegmentResources.mockResolvedValue({ items: [baseResource()] })
    renderPane()

    expect(await screen.findByRole('button', { name: '生成应付' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '查看应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
  })

  it('shows 查看应付 instead of 生成应付 / 重新生成 after payable is created', async () => {
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
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('shows 查看应付 for closed payable status and keeps 查看', async () => {
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'closed',
          hasPaymentSchedule: true,
          amountFieldsLocked: true,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '生成应付' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('navigates to payables tab with locate intent when 查看应付 is clicked', async () => {
    const user = userEvent.setup()
    listSegmentResources.mockResolvedValue({
      items: [
        baseResource({
          payableStatus: 'partial',
          hasPaymentSchedule: true,
        }),
      ],
    })
    renderPane()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应付' })).toBeTruthy()
    })
    await user.click(screen.getByRole('button', { name: '查看应付' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/$departureId',
      params: { departureId: 'departure-1' },
      search: {
        tab: 'payables',
        highlightSegmentResourceId: 'resource-1',
        segmentId: 'segment-1',
      },
    })
  })
})
