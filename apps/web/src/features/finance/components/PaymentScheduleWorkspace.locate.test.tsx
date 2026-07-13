import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PaymentScheduleSourceType, PaymentScheduleStatus } from '@xiaotuanbao/shared'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { PaymentScheduleWorkspace } from './PaymentScheduleWorkspace'
import styles from './PaymentScheduleWorkspace.module.css'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listDepartureReceivables = vi.fn()
const listDeparturePayables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listDepartureReceivables: (...args: unknown[]) => listDepartureReceivables(...args),
  listDeparturePayables: (...args: unknown[]) => listDeparturePayables(...args),
  listReceivables: vi.fn(),
  listPayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(async () => ({
    id: 'departure-1',
    departureNo: 'XTB2026070003',
    name: '乌镇西栅2日线',
  })),
}))

function schedule(
  overrides: Partial<PaymentScheduleSummary> = {},
): PaymentScheduleSummary {
  return {
    id: 'schedule-1',
    departureId: 'departure-1',
    departureStatus: 'editing',
    direction: 'receivable',
    scheduleNo: 'AR2026070001',
    title: '客户结算',
    amountCents: 500000,
    dueDate: '2026-07-20',
    counterpartyType: 'partner',
    counterpartyId: 'partner-1',
    counterpartyName: '杭州同行',
    sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    sourceId: 'order-1',
    status: PaymentScheduleStatus.PENDING,
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 500000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderReceivableWorkspace(highlightSourceOrderId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onHighlightConsumed = vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <PaymentScheduleWorkspace
          scope="departure"
          direction="receivable"
          departureId="departure-1"
          highlightSourceOrderId={highlightSourceOrderId}
          onHighlightConsumed={onHighlightConsumed}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )

  return { onHighlightConsumed }
}

function renderPayableWorkspace(highlightSegmentResourceId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onHighlightConsumed = vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <PaymentScheduleWorkspace
          scope="departure"
          direction="payable"
          departureId="departure-1"
          highlightSegmentResourceId={highlightSegmentResourceId}
          onHighlightConsumed={onHighlightConsumed}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )

  return { onHighlightConsumed }
}

describe('PaymentScheduleWorkspace locate highlight', () => {
  afterEach(() => {
    cleanup()
    listDepartureReceivables.mockReset()
    listDeparturePayables.mockReset()
  })

  it('marks matching source-order rows with locate flash class', async () => {
    listDepartureReceivables.mockResolvedValue({
      items: [
        schedule({ id: 'schedule-1', sourceId: 'order-1' }),
        schedule({
          id: 'schedule-2',
          scheduleNo: 'AR2026070002',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          sourceId: 'order-2',
          title: '我方代收',
        }),
        schedule({
          id: 'schedule-3',
          scheduleNo: 'AR2026070003',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          sourceId: 'order-1',
          title: '我方代收',
          status: PaymentScheduleStatus.CANCELLED,
          cancelledAt: '2026-07-02T00:00:00.000Z',
        }),
      ],
      total: 3,
      page: 1,
      pageSize: 10,
    })

    renderReceivableWorkspace('order-1')

    await waitFor(() => {
      expect(screen.getByText('AR2026070001')).toBeTruthy()
    })

    const matched = screen.getByText('AR2026070001').closest('tr')
    const other = screen.getByText('AR2026070002').closest('tr')
    const closed = screen.getByText('AR2026070003').closest('tr')

    expect(matched?.className).toContain(styles.locateFlash)
    expect(closed?.className).toContain(styles.locateFlash)
    expect(other?.className).not.toContain(styles.locateFlash)
  })

  it('marks matching segment-resource payable rows with locate flash class', async () => {
    listDeparturePayables.mockResolvedValue({
      items: [
        schedule({
          id: 'payable-1',
          direction: 'payable',
          scheduleNo: 'AP2026070001',
          title: '西栅团队票',
          counterpartyType: 'supplier',
          counterpartyId: 'supplier-1',
          counterpartyName: '乌镇西栅景区',
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-1',
        }),
        schedule({
          id: 'payable-2',
          direction: 'payable',
          scheduleNo: 'AP2026070002',
          title: '酒店房费',
          counterpartyType: 'supplier',
          counterpartyId: 'supplier-2',
          counterpartyName: '乌镇酒店',
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-2',
        }),
        schedule({
          id: 'payable-3',
          direction: 'payable',
          scheduleNo: 'AP2026070003',
          title: '西栅团队票（已关闭）',
          counterpartyType: 'supplier',
          counterpartyId: 'supplier-1',
          counterpartyName: '乌镇西栅景区',
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-1',
          status: PaymentScheduleStatus.CANCELLED,
          cancelledAt: '2026-07-02T00:00:00.000Z',
        }),
      ],
      total: 3,
      page: 1,
      pageSize: 10,
    })

    renderPayableWorkspace('resource-1')

    await waitFor(() => {
      expect(screen.getByText('AP2026070001')).toBeTruthy()
    })

    const matched = screen.getByText('AP2026070001').closest('tr')
    const other = screen.getByText('AP2026070002').closest('tr')
    const closed = screen.getByText('AP2026070003').closest('tr')

    expect(matched?.className).toContain(styles.locateFlash)
    expect(closed?.className).toContain(styles.locateFlash)
    expect(other?.className).not.toContain(styles.locateFlash)
  })
})

describe('PaymentScheduleWorkspace initial counterparty filter', () => {
  afterEach(() => {
    cleanup()
    listDepartureReceivables.mockReset()
    listDeparturePayables.mockReset()
  })

  it('applies initial partner filter when opening receivables from 查看应收', async () => {
    listDepartureReceivables.mockResolvedValue({
      items: [schedule()],
      total: 1,
      page: 1,
      pageSize: 10,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <PaymentScheduleWorkspace
            scope="departure"
            direction="receivable"
            departureId="departure-1"
            initialCounterpartyKeyword="杭州同行"
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(listDepartureReceivables).toHaveBeenCalled()
    })

    expect(listDepartureReceivables).toHaveBeenCalledWith(
      'departure-1',
      expect.objectContaining({
        counterpartyKeyword: '杭州同行',
      }),
    )
  })
})
