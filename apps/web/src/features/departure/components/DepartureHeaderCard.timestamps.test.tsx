import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { DepartureHeaderCard } from './DepartureHeaderCard'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

describe('DepartureHeaderCard 时间信息', () => {
  it('在负责人后始终显示中国标准时间的创建和更新时间', () => {
    const departure = {
      id: 'departure-1',
      departureNo: 'TB2026070001',
      name: '北疆八日游',
      routeName: '北疆环线',
      departureType: 'independent',
      departureProgress: 'not_started',
      status: 'draft',
      startDate: '2026-07-20',
      endDate: '2026-07-27',
      dayCount: 8,
      ownerName: '张三',
      createdAt: '2026-07-14T00:05:59.000Z',
      updatedAt: '2026-07-14T01:06:59.000Z',
      archiveHistory: [],
      settlementHistory: [],
    } as unknown as DepartureDetail

    render(<DepartureHeaderCard departure={departure} menuItems={[]} />)

    expect(screen.getByText('创建时间')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14 08:05')).toBeInTheDocument()
    expect(screen.getByText('更新时间')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14 09:06')).toBeInTheDocument()
  })
})
