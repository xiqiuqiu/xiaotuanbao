import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider, Form, Modal } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType, TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureTransitionModal } from './DepartureTransitionModal'

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
      <a href={`${path}?${new URLSearchParams(search).toString()}`} data-testid="tx-link">
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
    canPurge: false,
    grossReceivableCents: 1_000_000,
    fareAdjustmentNetCents: 0,
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

function Harness({
  action = 'settled' as const,
  departure = makeDeparture(),
}: {
  action?: 'pending_settlement' | 'settled' | 'close'
  departure?: DepartureDetail
}) {
  const [closeForm] = Form.useForm()
  return (
    <ConfigProvider locale={zhCN}>
      <DepartureTransitionModal
        open
        action={action}
        departure={departure}
        loading={false}
        closeForm={closeForm}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onCloseSubmit={vi.fn()}
      />
    </ConfigProvider>
  )
}

describe('DepartureTransitionModal', () => {
  afterEach(() => {
    cleanup()
    Modal.destroyAll()
  })

  it('uses explicit obligation and cash summary labels after revoke-4000 scenario', () => {
    render(<Harness />)

    expect(screen.getByText('已核销应收 / 未结清应收')).toBeInTheDocument()
    expect(screen.getByText('已核销应付 / 未结清应付')).toBeInTheDocument()
    expect(screen.getByText('未核销收入')).toBeInTheDocument()
    expect(screen.getByText('未核销支出')).toBeInTheDocument()
    expect(screen.queryByText('已收 / 未收')).not.toBeInTheDocument()
    expect(screen.queryByText('已付 / 未付')).not.toBeInTheDocument()

    expect(screen.getByText('存在归属本发团的未核销资金')).toBeInTheDocument()
    expect(
      screen.getByText(/仍有未结清应收 ¥10,000\.00、未结清应付 ¥10,000\.00/),
    ).toBeInTheDocument()

    const links = screen.getAllByTestId('tx-link')
    expect(links.length).toBeGreaterThanOrEqual(2)
    expect(links.every((link) => !link.getAttribute('href')?.includes('writeoffStatus='))).toBe(
      true,
    )
    expect(links.every((link) => link.getAttribute('href')?.includes('tab=transactions'))).toBe(
      true,
    )
    expect(links.some((link) => link.getAttribute('href')?.includes(TransactionDirection.INFLOW))).toBe(
      true,
    )
    expect(
      links.some((link) => link.getAttribute('href')?.includes(TransactionDirection.OUTFLOW)),
    ).toBe(true)
  })
})
