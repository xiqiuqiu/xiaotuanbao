import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureStatus, DepartureType } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureNextActionAlert } from './DepartureNextActionAlert'

function makeOverviewStats(
  overrides: Partial<DepartureDetail['overviewStats']> = {},
): DepartureDetail['overviewStats'] {
  return {
    receivedCents: 0,
    openUnreceivedCents: 0,
    closedUnreceivedCents: 0,
    ungeneratedReceivableCents: 0,
    otherReceivableCents: 0,
    additionalIncomeNetCents: 0,
    settlementCollectionReceivedCents: 0,
    settlementCollectionReceivableCents: 0,
    guestCollectionReceivedCents: 0,
    guestCollectionAgreedCents: 0,
    estimatedRebateCents: 0,
    confirmedRebateCents: 0,
    rebatePaidCents: 0,
    rebateUnpaidCents: 0,
    confirmedPayableCents: 0,
    paidCents: 0,
    resourcePaidCents: 0,
    openUnpaidCents: 0,
    closedUnpaidCents: 0,
    ungeneratedPayableCents: 0,
    otherPayableCents: 0,
    resourcePayableDifferenceCents: 0,
    confirmedMarginCents: 0,
    incomeTransactionCents: 0,
    expenseTransactionCents: 0,
    cashNetInflowCents: 0,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    verifiedFromExternalCents: 0,
    verifiedToOtherDeparturesCents: 0,
    anomalies: [],
    ...overrides,
  }
}

function makeDeparture(overrides: Partial<DepartureDetail> = {}): DepartureDetail {
  return {
    id: 'departure-1',
    departureNo: 'XTB2026071016',
    name: '乌镇西栅2日线',
    routeName: '乌镇西栅2日线',
    routeSource: 'manual',
    sourceTemplateId: null,
    departureType: DepartureType.COMBINED,
    startDate: '2026-07-27',
    endDate: '2026-07-28',
    dayCount: 2,
    ownerUserId: 'user-1',
    status: DepartureStatus.EDITING,
    departureProgress: 'in_progress',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalGuests: 0,
    sourceOrderCount: 0,
    segmentCount: 1,
    resourceCount: 1,
    completionTags: {
      sourceOrders: '客源未录入',
      segments: '行程1段',
      resources: '资源1项',
      receivables: '应收未提交',
      payables: '应付未提交',
    },
    grossReceivableCents: 0,
    fareAdjustmentNetCents: 0,
    discountCents: 0,
    netReceivableCents: 0,
    payableCents: 0,
    estimatedMarginCents: 0,
    canPurge: false,
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 0,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 0,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    overviewStats: makeOverviewStats(),
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  }
}

function renderAlert(
  departure: DepartureDetail,
  onAction = vi.fn(),
  canWrite = true,
) {
  return render(
    <ConfigProvider locale={zhCN}>
      <DepartureNextActionAlert
        departure={departure}
        canWrite={canWrite}
        onAction={onAction}
      />
    </ConfigProvider>,
  )
}

describe('DepartureNextActionAlert', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows the next-action guidance for incomplete source orders', () => {
    renderAlert(makeDeparture())

    expect(screen.getByText('客源未录入')).toBeInTheDocument()
    expect(screen.queryByText('客源尚未完备')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '完善客源' })).toBeInTheDocument()
  })

  it('renders a compact inline strip (title · detail + CTA), not a tall stacked Alert', () => {
    const { container } = renderAlert(makeDeparture())
    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert?.className).toMatch(/alertCompact/)

    const css = readFileSync(resolve(__dirname, './DepartureNextActionAlert.module.css'), 'utf8')
    expect(css).toMatch(/\.alertCompact\s*\{[^}]*padding-block:\s*8px/)
    expect(css).toMatch(/\.line\s*\{[^}]*display:\s*flex/)

    // Incomplete prep: one title only (tag copy), CTA in the same strip.
    const line = container.querySelector('[class*="line"]')
    expect(line).toBeTruthy()
    expect(line?.textContent).toMatch(/客源未录入/)
    expect(line?.textContent).not.toMatch(/尚未完备/)
    expect(within(line as HTMLElement).getByRole('button', { name: '完善客源' })).toBeInTheDocument()
  })

  it('顶部财务异常只保留行动摘要，不重复概览金额明细', () => {
    renderAlert(
      makeDeparture({
        status: DepartureStatus.PENDING_SETTLEMENT,
        completionTags: {
          sourceOrders: '客源1单',
          segments: '行程1段',
          resources: '资源1项',
          receivables: '应收已提交',
          payables: '应付已提交',
        },
        overviewStats: makeOverviewStats({
          anomalies: [
            {
              code: 'receivable_balance',
              expectedCents: 100_000,
              actualCents: 80_000,
              differenceCents: -20_000,
            },
          ],
        }),
      }),
    )

    expect(screen.getByText('应收金额存在异常，请核对后再继续结算。')).toBeInTheDocument()
    expect(screen.queryByText(/已提交应收合计/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看应收' })).toBeInTheDocument()
  })

  it('hides after close and stays hidden after remount for the same fingerprint', async () => {
    const user = userEvent.setup()
    const departure = makeDeparture()
    const { unmount } = renderAlert(departure)

    expect(screen.getByText('客源未录入')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('客源未录入')).not.toBeInTheDocument()

    unmount()
    renderAlert(departure)
    expect(screen.queryByText('客源未录入')).not.toBeInTheDocument()
  })

  it('shows again when guidance fingerprint changes', async () => {
    const user = userEvent.setup()
    const departure = makeDeparture()
    const { rerender } = renderAlert(departure)

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('客源未录入')).not.toBeInTheDocument()

    const nextDeparture = makeDeparture({
      completionTags: {
        sourceOrders: '客源1单',
        segments: '行程未录入',
        resources: '资源1项',
        receivables: '应收未提交',
        payables: '应付未提交',
      },
      sourceOrderCount: 1,
      segmentCount: 0,
    })

    rerender(
      <ConfigProvider locale={zhCN}>
        <DepartureNextActionAlert
          departure={nextDeparture}
          canWrite
          onAction={vi.fn()}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('行程未录入')).toBeInTheDocument()
    expect(screen.queryByText('行程尚未完备')).not.toBeInTheDocument()
  })
})
