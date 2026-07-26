import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLedgerResult } from '@/types/api'
import { RouteLedgerViewPanel } from './RouteLedgerViewPanel'

const listDepartureRouteNames = vi.fn()
const getDepartureRouteLedger = vi.fn()

vi.mock('@/services/departure.service', () => ({
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
  getDepartureRouteLedger: (...args: unknown[]) => getDepartureRouteLedger(...args),
}))

const ledgerFixture: RouteLedgerResult = {
  routeName: '伊犁环线',
  startDateFrom: null,
  startDateTo: null,
  dateBlocks: [
    {
      startDate: '2026-07-15',
      totals: {
        orderCount: 2,
        guestCount: 5,
        grossReceivableCents: 420000,
        netReceivableCents: 420000,
        partnerCollectedCents: 420000,
        guestCollectCents: 0,
      },
      departures: [
        {
          departureId: 'dep-a',
          departureNo: 'XTB202607150001',
          departureName: '同日团 A',
          startDate: '2026-07-15',
          totals: {
            orderCount: 1,
            guestCount: 2,
            grossReceivableCents: 180000,
            netReceivableCents: 180000,
            partnerCollectedCents: 180000,
            guestCollectCents: 0,
          },
          sourceOrders: [
            {
              id: 'so-a',
              departureId: 'dep-a',
              partnerId: 'p1',
              partnerName: '华东国旅',
              displayName: '华东国旅',
              adultGuestCount: 2,
              childGuestCount: 0,
              guestCount: 2,
              grossReceivableCents: 180000,
              netReceivableCents: 180000,
              partnerCollectedCents: 180000,
              guestCollectCents: 0,
              notes: '同日团 A',
            },
          ],
        },
        {
          departureId: 'dep-b',
          departureNo: 'XTB202607150002',
          departureName: '同日团 B',
          startDate: '2026-07-15',
          totals: {
            orderCount: 1,
            guestCount: 3,
            grossReceivableCents: 240000,
            netReceivableCents: 240000,
            partnerCollectedCents: 240000,
            guestCollectCents: 0,
          },
          sourceOrders: [
            {
              id: 'so-b',
              departureId: 'dep-b',
              partnerId: 'p1',
              partnerName: '华东国旅',
              displayName: '华东国旅',
              adultGuestCount: 3,
              childGuestCount: 0,
              guestCount: 3,
              grossReceivableCents: 240000,
              netReceivableCents: 240000,
              partnerCollectedCents: 240000,
              guestCollectCents: 0,
              notes: '同日团 B',
            },
          ],
        },
      ],
    },
  ],
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <RouteLedgerViewPanel onSwitchToDepartureList={vi.fn()} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('RouteLedgerViewPanel', () => {
  beforeEach(() => {
    listDepartureRouteNames.mockReset()
    getDepartureRouteLedger.mockReset()
    listDepartureRouteNames.mockResolvedValue({
      items: ['伊犁环线', '阿勒泰拼车'],
    })
    getDepartureRouteLedger.mockResolvedValue(ledgerFixture)
  })

  afterEach(() => {
    cleanup()
  })

  it('未选路线时显示空态，提示须先选线路', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listDepartureRouteNames).toHaveBeenCalled()
    })

    expect(screen.getByText('请先选择路线名称')).toBeInTheDocument()
    expect(screen.getByText(/线路视图需先选定一条路线/)).toBeInTheDocument()
    expect(getDepartureRouteLedger).not.toHaveBeenCalled()
  })

  it('选定路线后按日→发团→客源渲染只读表，同日多团边界清晰', async () => {
    const user = userEvent.setup()
    renderPanel()

    const combobox = await screen.findByRole('combobox', { name: '路线名称' })
    await user.click(combobox)

    const option = await screen.findByRole('option', { name: '伊犁环线' })
    await user.click(option)

    await waitFor(() => {
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        expect.objectContaining({ routeName: '伊犁环线' }),
        expect.anything(),
      )
    })

    expect(screen.getByText('2026-07-15')).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150001/)).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150002/)).toBeInTheDocument()

    for (const title of ['发客客户', '人数', '原始团款', '结算金额', '客户已收', '我方代收', '备注']) {
      expect(screen.getAllByRole('columnheader', { name: title }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText('实收业务')).not.toBeInTheDocument()

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(within(tables[0]).getByText('同日团 A')).toBeInTheDocument()
    expect(within(tables[1]).getByText('同日团 B')).toBeInTheDocument()
  })
})
