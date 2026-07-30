import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { DepartureHeaderCard } from './DepartureHeaderCard'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({
    history: {
      canGoBack: () => false,
      back: vi.fn(),
    },
  }),
  useRouterState: () => undefined,
  useSearch: () => ({}),
}))

afterEach(() => {
  cleanup()
})

function buildDeparture(
  overrides: Partial<DepartureDetail> = {},
): DepartureDetail {
  return {
    id: 'departure-1',
    departureNo: 'TB2026070001',
    name: '北疆八日游',
    routeName: '北疆环线',
    departureType: 'independent',
    departureProgress: 'not_started',
    status: 'editing',
    startDate: '2026-07-20',
    endDate: '2026-07-27',
    dayCount: 8,
    totalGuests: 12,
    ownerName: '张三',
    driverSupplierName: '王师傅车队',
    guideSupplierName: '李导游',
    vehiclePlate: '新A·20601',
    contactPhone: '13800138000',
    createdAt: '2026-07-14T00:05:59.000Z',
    updatedAt: '2026-07-14T01:06:59.000Z',
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  } as unknown as DepartureDetail
}

describe('DepartureHeaderCard 执行班组', () => {
  it('页头班组一行展示司机、导游、车牌、电话，文案无「名称」后缀', () => {
    render(
      <DepartureHeaderCard
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

    expect(screen.queryByText('司机名称')).not.toBeInTheDocument()
    expect(screen.queryByText('导游名称')).not.toBeInTheDocument()
    expect(screen.queryByText('司机车牌')).not.toBeInTheDocument()
    expect(screen.queryByText('联系电话')).not.toBeInTheDocument()
  })

  it('班组字段为空时显示「-」', () => {
    render(
      <DepartureHeaderCard
        departure={buildDeparture({
          driverSupplierName: null,
          guideSupplierName: '  ',
          vehiclePlate: null,
          contactPhone: null,
        })}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    const crew = screen.getByLabelText('执行班组')
    const values = within(crew)
      .getAllByText('-')
      .map((node) => node.textContent)
    expect(values).toHaveLength(4)
  })
})
