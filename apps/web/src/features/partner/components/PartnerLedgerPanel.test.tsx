import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerLedgerPanel } from './PartnerLedgerPanel'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listPartnerReceivables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))
const listPartnerPayables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))

vi.mock('@/services/finance.service', () => ({
  listPartnerReceivables: (...args: unknown[]) => listPartnerReceivables(...(args as [])),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...(args as [])),
  listReceivables: vi.fn(),
  listPayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
  getPartnerPaymentScheduleSummary: vi.fn(async () => ({ groups: [] })),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PartnerLedgerPanel partnerId="partner-1" />
    </QueryClientProvider>,
  )
}

describe('PartnerLedgerPanel', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    listPartnerReceivables.mockClear()
    listPartnerPayables.mockClear()
  })

  it('keeps the direction Segmented outside the filter bar', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalled()
    })

    const directionSwitch = screen.getByRole('radiogroup', { name: 'segmented control' })
    const departureStart = screen.getByPlaceholderText('出团日期起')
    const filterBar = departureStart.closest('.ant-card') ?? departureStart.closest('div')

    expect(filterBar).toBeTruthy()
    expect(filterBar!.contains(directionSwitch)).toBe(false)
    expect(filterBar!).toContainElement(departureStart)
  })

  it('lays out all ledger filters flat without expand/collapse', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalled()
    })

    expect(screen.getByPlaceholderText('出团日期起')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索应收单号 / 收款方式')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('到期日起')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '应收状态' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*置/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('keeps the shared departure-date filter when switching receivable ↔ payable', async () => {
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalled()
    })

    // 顶部共用出团日期（不在方向切换后消失）
    const start = screen.getByPlaceholderText('出团日期起')
    await user.click(start)
    // Ant Design RangePicker：点快捷「本月」建立区间
    await user.click(await screen.findByText('本月'))

    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({
          departureDateFrom: expect.any(String),
          departureDateTo: expect.any(String),
        }),
        expect.any(AbortSignal),
      )
    })

    const lastReceivableCall = listPartnerReceivables.mock.calls.at(-1)?.[1] as {
      departureDateFrom?: string
      departureDateTo?: string
    }
    const sharedFrom = lastReceivableCall.departureDateFrom
    const sharedTo = lastReceivableCall.departureDateTo
    expect(sharedFrom).toBeTruthy()
    expect(sharedTo).toBeTruthy()

    await user.click(screen.getByText('应付'))

    await waitFor(() => {
      expect(listPartnerPayables).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({
          departureDateFrom: sharedFrom,
          departureDateTo: sharedTo,
        }),
        expect.any(AbortSignal),
      )
    })
  })
})
