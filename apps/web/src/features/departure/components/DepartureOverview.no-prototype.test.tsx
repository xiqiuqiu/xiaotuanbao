/**
 * 正式发团概览不应挂载 throwaway 原型切换条 / host 徽标。
 * （对照：增收记录、客源已收口；概览 host 仍挂在主路径上时本用例应红。）
 */
import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverview } from './DepartureOverview'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ departureId: 'departure-88' }),
  useSearch: () => ({ tab: 'overview', variant: 'A' }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

function makeDeparture(): DepartureDetail {
  return {
    id: 'departure-88',
    departureNo: 'XTB2026070088',
    name: '概览原型收口团',
    routeName: '测试线',
    routeSource: 'manual',
    sourceTemplateId: null,
    departureType: DepartureType.COMBINED,
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    dayCount: 10,
    ownerUserId: 'user-1',
    status: 'editing',
    departureProgress: 'not_started',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalGuests: 12,
    sourceOrderCount: 1,
    segmentCount: 1,
    resourceCount: 1,
    completionTags: {
      sourceOrders: '客源1单',
      segments: '行程1段',
      resources: '资源1项',
      receivables: '应收未提交',
      payables: '应付未提交',
    },
    grossReceivableCents: 1_200_000,
    fareAdjustmentNetCents: 0,
    discountCents: 0,
    netReceivableCents: 1_200_000,
    payableCents: 700_000,
    estimatedMarginCents: 500_000,
    canPurge: true,
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 1_200_000,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 700_000,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    overviewStats: {
      receivedCents: 0,
      openUnreceivedCents: 1_200_000,
      closedUnreceivedCents: 0,
      ungeneratedReceivableCents: 0,
      otherReceivableCents: 0,
      additionalIncomeNetCents: 0,
      settlementCollectionReceivedCents: 0,
      settlementCollectionReceivableCents: 1_200_000,
      guestCollectionReceivedCents: 0,
      guestCollectionAgreedCents: 0,
      estimatedRebateCents: 0,
      confirmedRebateCents: 0,
      rebatePaidCents: 0,
      rebateUnpaidCents: 0,
      confirmedPayableCents: 700_000,
      paidCents: 0,
      resourcePaidCents: 0,
      openUnpaidCents: 700_000,
      closedUnpaidCents: 0,
      ungeneratedPayableCents: 0,
      otherPayableCents: 0,
      resourcePayableDifferenceCents: 0,
      confirmedMarginCents: 500_000,
      incomeTransactionCents: 0,
      expenseTransactionCents: 0,
      cashNetInflowCents: 0,
      unverifiedIncomeCents: 0,
      unverifiedExpenseCents: 0,
      verifiedFromExternalCents: 0,
      verifiedToOtherDeparturesCents: 0,
      anomalies: [],
    },
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
  }
}

afterEach(() => {
  cleanup()
})

describe('DepartureOverview prototype removal', () => {
  it('does not show PrototypeSwitcher or A/B/C chrome even when ?variant=A', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <DepartureOverview
          departure={makeDeparture()}
          animateEnter={false}
          mutationLocked={false}
        />
      </ConfigProvider>,
    )

    // Formal overview still renders
    expect(screen.getByText('总人数')).toBeInTheDocument()

    // Throwaway prototype chrome must not appear
    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一方案')).not.toBeInTheDocument()
    expect(screen.queryByText(/overview prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/强化主指标带/)).not.toBeInTheDocument()
    expect(screen.queryByText(/损益纵轴/)).not.toBeInTheDocument()
    expect(screen.queryByText(/报表清单/)).not.toBeInTheDocument()
  })
})
