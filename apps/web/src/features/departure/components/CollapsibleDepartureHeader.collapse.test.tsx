import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { encodeDepartureListReturn } from '../utils/departure-list-search'
import { CollapsibleDepartureHeader } from './CollapsibleDepartureHeader'

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

function buildDeparture(
  overrides: Partial<DepartureDetail> = {},
): DepartureDetail {
  return {
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
    driverSupplierName: '王师傅车队',
    guideSupplierName: '李导游',
    vehiclePlate: '新A·20601',
    contactPhone: '13800138000',
    createdAt: '2026-07-21T03:09:00.000Z',
    updatedAt: '2026-07-21T03:09:00.000Z',
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  } as unknown as DepartureDetail
}

describe('CollapsibleDepartureHeader 折叠', () => {
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

  it('进入详情时默认收起为单行，不展示完整头能力', () => {
    render(
      <CollapsibleDepartureHeader
        departure={buildDeparture()}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    expect(screen.getByText('乌镇西栅2日线 7月26日团')).toBeInTheDocument()
    expect(screen.getByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('编辑中')).toBeInTheDocument()
    expect(screen.getByText('XTB2026070003')).toBeInTheDocument()
    expect(screen.getByText('2026-07-26 ~ 2026-07-27')).toBeInTheDocument()
    expect(screen.getByText('78 人')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '状态与操作' })).not.toBeInTheDocument()
    expect(screen.queryByText(/最近更新/)).not.toBeInTheDocument()
    expect(screen.queryByText('负责人')).not.toBeInTheDocument()
    expect(screen.queryByText('行程 · 未开始')).not.toBeInTheDocument()
  })

  it('收起态仍可返回发团管理', async () => {
    const user = userEvent.setup()
    mockSearch = {
      listReturn: encodeDepartureListReturn({
        keyword: '乌镇',
        view: 'route-ledger',
      }),
    }

    render(
      <CollapsibleDepartureHeader
        departure={buildDeparture()}
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

  it('收起态非发团管理来源时走 history.back', async () => {
    const user = userEvent.setup()

    render(
      <CollapsibleDepartureHeader
        departure={buildDeparture()}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '返回' }))

    expect(historyBack).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('收起态可见司机、导游、车牌、电话，标签与值分开展示', () => {
    render(
      <CollapsibleDepartureHeader
        departure={buildDeparture()}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    const crew = screen.getByLabelText('执行班组')
    expect(within(crew).getByText('司机')).toBeInTheDocument()
    expect(within(crew).getByText('导游')).toBeInTheDocument()
    expect(within(crew).getByText('车牌')).toBeInTheDocument()
    expect(within(crew).getByText('电话')).toBeInTheDocument()
    expect(within(crew).getByText('王师傅车队')).toBeInTheDocument()
    expect(within(crew).getByText('李导游')).toBeInTheDocument()
    expect(within(crew).getByText('新A·20601')).toBeInTheDocument()
    expect(within(crew).getByText('13800138000')).toBeInTheDocument()
  })

  it('可展开为完整发团头，并可再次收起', async () => {
    const user = userEvent.setup()

    render(
      <CollapsibleDepartureHeader
        departure={buildDeparture()}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '展开' }))

    expect(screen.getByRole('button', { name: '收起发团信息' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '状态与操作' })).toBeInTheDocument()
    expect(screen.getByText('行程 · 未开始')).toBeInTheDocument()
    expect(screen.getByText('财务 · 编辑中')).toBeInTheDocument()
    expect(screen.getByText(/最近更新/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起发团信息' }))

    expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '状态与操作' })).not.toBeInTheDocument()
    expect(screen.queryByText(/最近更新/)).not.toBeInTheDocument()
  })
})
