/**
 * 正式发团概览不应挂载 throwaway 原型切换条 / host（#279）。
 * B 款生产组件为唯一实现；?overviewVariant= 不得切回原型。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverview } from './DepartureOverview'

const overviewSourcePath = resolve(dirname(fileURLToPath(import.meta.url)), './DepartureOverview.tsx')

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ departureId: 'departure-88' }),
  useSearch: () => ({ tab: 'overview', overviewVariant: 'B' }),
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
      additionalIncomeGrossCents: 0,
      additionalIncomeExpenseCents: 0,
      settlementCollectionReceivedCents: 0,
      settlementCollectionReceivableCents: 1_200_000,
      guestCollectionReceivedCents: 0,
      guestCollectionAgreedCents: 0,
      estimatedRebateCents: 0,
      confirmedRebateCents: 0,
      rebatePaidCents: 0,
      rebateUnpaidCents: 0,
      customerTopUpCents: 0,
      guestListRecorded: 0,
      guestListPlanned: 0,
      guestListMissing: 0,
      pendingReceivableCount: 0,
      pendingPayableCount: 0,
      unassignedSegmentCount: 0,
      overdueAccountCount: 0,
      resourceCostCents: 700_000,
      outsourceCostCents: 0,
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
  it('source does not import throwaway overview prototype host or overviewVariant', () => {
    const source = readFileSync(overviewSourcePath, 'utf8')
    expect(source).not.toMatch(/DepartureOverviewPrototypeHost/)
    expect(source).not.toMatch(/overviewVariant/)
    expect(source).not.toMatch(/prototype\/departure-overview/)
  })

  it('renders production B overview without prototype chrome', () => {
    render(
      <ConfigProvider locale={zhCN}>
        <DepartureOverview
          departure={makeDeparture()}
          animateEnter={false}
          mutationLocked={false}
        />
      </ConfigProvider>,
    )

    expect(screen.getByRole('heading', { name: '待办提醒' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '经营概况' })).toBeInTheDocument()
    expect(screen.getByText('收付款进度')).toBeInTheDocument()
    expect(screen.queryByText('总人数')).not.toBeInTheDocument()

    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一方案')).not.toBeInTheDocument()
    expect(screen.queryByText(/overview prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/强化主指标带/)).not.toBeInTheDocument()
    expect(screen.queryByText(/损益纵轴/)).not.toBeInTheDocument()
    expect(screen.queryByText(/报表清单/)).not.toBeInTheDocument()
  })
})
