import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('DepartureHeaderCard 时间信息', () => {
  it('将创建与更新时间收敛为次要元数据', () => {
    const departure = {
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
      createdAt: '2026-07-14T00:05:59.000Z',
      updatedAt: '2026-07-14T01:06:59.000Z',
      archiveHistory: [],
      settlementHistory: [],
    } as unknown as DepartureDetail

    render(
      <DepartureHeaderCard
        departure={departure}
        menuItems={[]}
        historyOpen={false}
        onHistoryOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/最近更新 2026-07-14 09:06/)).toBeInTheDocument()
    expect(screen.getByText(/创建于 2026-07-14 08:05/)).toBeInTheDocument()
    expect(screen.queryByText('创建时间')).not.toBeInTheDocument()
    expect(screen.queryByText('更新时间')).not.toBeInTheDocument()
    expect(screen.getByText('行程 · 未开始')).toBeInTheDocument()
    expect(screen.getByText('财务 · 编辑中')).toBeInTheDocument()
    expect(screen.getByText('负责人')).toBeInTheDocument()
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('12 人')).toBeInTheDocument()
  })
})
