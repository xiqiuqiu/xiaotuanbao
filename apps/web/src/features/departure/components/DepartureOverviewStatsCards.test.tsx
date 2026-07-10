import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType, TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to,
    )
    return (
      <a
        href={`${path}?${new URLSearchParams(search).toString()}`}
        data-testid="tx-link"
      >
        {children}
      </a>
    )
  },
}))

function makeDeparture(overrides: Partial<DepartureDetail> = {}): DepartureDetail {
  return {
    id: 'departure-88',
    departureNo: 'XTB2026070088',
    name: '摘要拆分测试团',
    routeName: '测试线',
    routeSource: 'manual',
    sourceTemplateId: null,
    departureType: DepartureType.COMBINED,
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    dayCount: 10,
    ownerUserId: 'user-1',
    status: 'pending_settlement',
    departureProgress: 'not_started',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalGuests: 1,
    sourceOrderCount: 1,
    segmentCount: 1,
    resourceCount: 1,
    completionTags: {
      sourceOrders: '客源1单',
      segments: '行程1段',
      resources: '资源1项',
      receivables: '应收已生成',
      payables: '应付已生成',
    },
    netReceivableCents: 1_000_000,
    payableCents: 1_000_000,
    estimatedMarginCents: 0,
    grossReceivableCents: 1_000_000,
    discountCents: 0,
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 1_000_000,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 1_000_000,
    unverifiedIncomeCents: 400_000,
    unverifiedExpenseCents: 400_000,
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  }
}

describe('DepartureOverviewStatsCards', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows obligation progress and unverified cash after revoking a 4000 verification', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <DepartureOverviewStatsCards departure={makeDeparture()} />
      </ConfigProvider>,
    )

    expect(screen.getByText('已核销应收 / 未结清应收')).toBeInTheDocument()
    expect(screen.getByText('已核销应付 / 未结清应付')).toBeInTheDocument()
    expect(screen.queryByText('已收 / 未收')).not.toBeInTheDocument()
    expect(screen.queryByText('已付 / 未付')).not.toBeInTheDocument()

    expect(screen.getByText(/未核销收入/)).toBeInTheDocument()
    expect(screen.getByText(/未核销支出/)).toBeInTheDocument()

    const links = screen.getAllByTestId('tx-link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/departure/departure-88?'),
    )
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('tab=transactions'))
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining(`direction=${TransactionDirection.INFLOW}`),
    )
    expect(links[0]).not.toHaveAttribute('href', expect.stringContaining('writeoffStatus='))
    expect(links[1]).toHaveAttribute('href', expect.stringContaining('tab=transactions'))
    expect(links[1]).toHaveAttribute(
      'href',
      expect.stringContaining(`direction=${TransactionDirection.OUTFLOW}`),
    )
  })

  it('hides unverified cash hints when both amounts are zero', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <DepartureOverviewStatsCards
          departure={makeDeparture({
            unverifiedIncomeCents: 0,
            unverifiedExpenseCents: 0,
          })}
        />
      </ConfigProvider>,
    )

    expect(screen.queryByText(/未核销收入/)).not.toBeInTheDocument()
    expect(screen.queryByText(/未核销支出/)).not.toBeInTheDocument()
  })
})
