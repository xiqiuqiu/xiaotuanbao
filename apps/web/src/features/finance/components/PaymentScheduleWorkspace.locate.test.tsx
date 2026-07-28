import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
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

function renderPayableWorkspace(options?: {
  highlightSegmentResourceId?: string
  highlightSourceOrderId?: string
}) {
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
          highlightSegmentResourceId={options?.highlightSegmentResourceId}
          highlightSourceOrderId={options?.highlightSourceOrderId}
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
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          sourceId: 'order-2',
          title: '尾款代收',
        }),
        schedule({
          id: 'schedule-3',
          scheduleNo: 'AR2026070003',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          sourceId: 'order-1',
          title: '尾款代收',
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

    renderPayableWorkspace({ highlightSegmentResourceId: 'resource-1' })

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

  it('marks matching source-order rebate payable rows with locate flash class', async () => {
    listDeparturePayables.mockResolvedValue({
      items: [
        schedule({
          id: 'rebate-1',
          direction: 'payable',
          scheduleNo: 'AP2026070091',
          title: '客源返利',
          counterpartyType: 'partner',
          counterpartyId: 'partner-1',
          counterpartyName: '杭州同行',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          sourceId: 'order-1',
        }),
        schedule({
          id: 'rebate-2',
          direction: 'payable',
          scheduleNo: 'AP2026070092',
          title: '客源返利',
          counterpartyType: 'partner',
          counterpartyId: 'partner-2',
          counterpartyName: '上海同行',
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          sourceId: 'order-2',
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    })

    renderPayableWorkspace({ highlightSourceOrderId: 'order-1' })

    await waitFor(() => {
      expect(screen.getByText('AP2026070091')).toBeTruthy()
    })

    const matched = screen.getByText('AP2026070091').closest('tr')
    const other = screen.getByText('AP2026070092').closest('tr')

    expect(matched?.className).toContain(styles.locateFlash)
    expect(other?.className).not.toContain(styles.locateFlash)
  })
})

/**
 * Repro（plan 017）：定位目标行落在第 2 页时，flash 结束后 pendingPage 应清空为 null，
 * 视图停留在第 2 页且翻页不被锁死；旧实现把 pendingPage 置为 1，会静默弹回并锁死翻页。
 */
describe('PaymentScheduleWorkspace locate on a later page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    cleanup()
    listDepartureReceivables.mockReset()
    vi.useRealTimers()
  })

  it('stays on the target page and keeps paging free after the flash clears', async () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      schedule({
        id: `schedule-${index + 1}`,
        scheduleNo: `AR20260700${String(index + 1).padStart(2, '0')}`,
        sourceId: index === 10 ? 'order-target' : `order-${index + 1}`,
      }),
    )
    listDepartureReceivables.mockResolvedValue({
      items,
      total: items.length,
      page: 1,
      pageSize: 100,
    })

    renderReceivableWorkspace('order-target')

    // Target row is at index 10 → floor(10 / 10) + 1 = page 2.
    expect(await screen.findByText('AR2026070011')).toBeInTheDocument()
    expect(screen.queryByText('AR2026070001')).not.toBeInTheDocument()

    // After the flash clears, the view must stay on page 2 (not bounce to page 1).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(screen.getByText('AR2026070011')).toBeInTheDocument()
    expect(screen.queryByText('AR2026070001')).not.toBeInTheDocument()

    // Paging must not be locked to page 1: jumping to page 3 sticks.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByTitle('3'))
    expect(await screen.findByText('AR2026070021')).toBeInTheDocument()
    expect(screen.queryByText('AR2026070011')).not.toBeInTheDocument()
  })
})

describe('PaymentScheduleWorkspace query error', () => {
  afterEach(() => {
    cleanup()
    listDepartureReceivables.mockReset()
  })

  it('shows an error instead of an empty table and retries the query', async () => {
    listDepartureReceivables
      .mockRejectedValueOnce(new Error('应收接口不可用'))
      .mockResolvedValueOnce({
        items: [schedule()],
        total: 1,
        page: 1,
        pageSize: 10,
      })

    renderReceivableWorkspace()

    expect(await screen.findByText('应收单加载失败')).toBeInTheDocument()
    expect(screen.getByText('应收接口不可用')).toBeInTheDocument()
    expect(screen.queryByText('共 0 条')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))

    expect(await screen.findByText('AR2026070001')).toBeInTheDocument()
    expect(listDepartureReceivables).toHaveBeenCalledTimes(2)
  })
})

describe('PaymentScheduleWorkspace server search debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    cleanup()
    listDepartureReceivables.mockReset()
    vi.useRealTimers()
  })

  it('waits for the final counterparty value and aborts the obsolete query', async () => {
    listDepartureReceivables.mockImplementation(() => new Promise(() => undefined))
    renderReceivableWorkspace()

    await waitFor(() => expect(listDepartureReceivables).toHaveBeenCalledTimes(1))
    const firstSignal = listDepartureReceivables.mock.calls[0]?.[2] as AbortSignal
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.type(screen.getByPlaceholderText('收款对象'), '上海')
    expect(listDepartureReceivables).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    await waitFor(() => expect(listDepartureReceivables).toHaveBeenCalledTimes(2))
    expect(listDepartureReceivables.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ counterpartyKeyword: '上海' }),
    )
    expect(firstSignal.aborted).toBe(true)
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
      expect.any(AbortSignal),
    )
  })
})

/**
 * Repro: 执行安排「查看应付」→ 应付管理带 highlight + counterpartyKeyword。
 * 高亮结束后父级清掉 highlight 时，列表接口不应因 queryKey 变化再打一次。
 */
describe('PaymentScheduleWorkspace view-payable fetch count', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    cleanup()
    listDeparturePayables.mockReset()
    vi.useRealTimers()
  })

  it('fetches departure payables only once after locate flash clears highlight', async () => {
    listDeparturePayables.mockResolvedValue({
      items: [
        schedule({
          id: 'payable-1',
          direction: 'payable',
          scheduleNo: 'AP2026070001',
          title: '地接费用',
          counterpartyType: 'partner',
          counterpartyId: 'partner-1',
          counterpartyName: '巴州博湖旅行社',
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: 'resource-1',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Parent() {
      const [highlightId, setHighlightId] = useState<string | undefined>('resource-1')
      return (
        <QueryClientProvider client={queryClient}>
          <ConfigProvider>
            <PaymentScheduleWorkspace
              scope="departure"
              direction="payable"
              departureId="departure-1"
              highlightSegmentResourceId={highlightId}
              initialCounterpartyKeyword="巴州博湖旅行社"
              onHighlightConsumed={() => setHighlightId(undefined)}
            />
          </ConfigProvider>
        </QueryClientProvider>
      )
    }

    render(<Parent />)

    await waitFor(() => {
      expect(listDeparturePayables).toHaveBeenCalled()
    })

    // Locate flash is LOCATE_FLASH_MS = 480; then parent clears highlight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    await waitFor(() => {
      expect(listDeparturePayables.mock.calls.length).toBe(1)
    })

    expect(listDeparturePayables).toHaveBeenCalledWith(
      'departure-1',
      expect.objectContaining({
        counterpartyKeyword: '巴州博湖旅行社',
        pageSize: 100,
      }),
      expect.any(AbortSignal),
    )

    cleanup()
    listDeparturePayables.mockClear()
    const remountQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={remountQueryClient}>
        <ConfigProvider>
          <PaymentScheduleWorkspace
            scope="departure"
            direction="payable"
            departureId="departure-1"
            initialCounterpartyKeyword="巴州博湖旅行社"
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(listDeparturePayables).toHaveBeenCalledTimes(1))
    expect(listDeparturePayables).toHaveBeenCalledWith(
      'departure-1',
      expect.objectContaining({ pageSize: 10 }),
      expect.any(AbortSignal),
    )
  })
})
