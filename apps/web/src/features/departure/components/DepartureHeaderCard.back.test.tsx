import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { encodeDepartureListReturn } from '../utils/departure-list-search'
import { DepartureHeaderCard } from './DepartureHeaderCard'

const navigate = vi.fn()
const historyBack = vi.fn()
let canGoBack = true
let mockSearch: { listReturn?: string } = {}
let mockLocationState: unknown

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouter: () => ({
    history: {
      canGoBack: () => canGoBack,
      back: historyBack,
    },
  }),
  useRouterState: () => mockLocationState,
  useSearch: () => mockSearch,
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月26日团',
  routeName: '乌镇西栅2日线',
  departureType: 'independent',
  departureProgress: 'not_started',
  status: 'editing',
  startDate: '2026-07-26',
  endDate: '2026-07-27',
  dayCount: 2,
  totalGuests: 78,
  ownerName: '王姐',
  createdAt: '2026-07-21T03:09:00.000Z',
  updatedAt: '2026-07-21T03:09:00.000Z',
  archiveHistory: [],
  settlementHistory: [],
} as unknown as DepartureDetail

describe('DepartureHeaderCard 返回', () => {
  beforeEach(() => {
    navigate.mockReset()
    historyBack.mockReset()
    canGoBack = true
    mockSearch = {}
    mockLocationState = undefined
  })

  afterEach(() => {
    cleanup()
  })

  it('从发团管理进入时返回列表并带上 listReturn 筛选', async () => {
    const user = userEvent.setup()
    mockSearch = {
      listReturn: encodeDepartureListReturn({
        keyword: '乌镇',
        view: 'route-ledger',
      }),
    }

    render(
      <DepartureHeaderCard
        departure={departure}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '返回发团管理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回发团管理' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure',
      search: {
        keyword: '乌镇',
        view: 'route-ledger',
      },
    })
    expect(historyBack).not.toHaveBeenCalled()
  })

  it('非发团管理来源时走 history.back 回到跳转来源', async () => {
    const user = userEvent.setup()

    render(
      <DepartureHeaderCard
        departure={departure}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回' }))

    expect(historyBack).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('无历史可回时回退到发团管理', async () => {
    const user = userEvent.setup()
    canGoBack = false

    render(
      <DepartureHeaderCard
        departure={departure}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '返回' }))

    expect(historyBack).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: '/departure' })
  })
})
