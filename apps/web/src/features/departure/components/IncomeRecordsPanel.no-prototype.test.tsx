import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DepartureIncomeCollectionStatus,
  DepartureIncomeCommissionStatus,
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
  DepartureType,
  type DepartureDetail,
  type DepartureIncomeRecordSummary,
} from '@xiaotuanbao/shared'
import { IncomeRecordsPanel } from './IncomeRecordsPanel'

/**
 * ADR-0036 / 04 收口护栏：正式「增收记录」页签不挂载 A/B/C 原型与 PrototypeSwitcher；
 * ?variant= 不得劫持正式面板。
 */

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ variant: 'A', tab: 'incomeRecords' }),
}))

const listIncomeRecords = vi.fn()

vi.mock('@/services/income-record.service', () => ({
  listIncomeRecords: (...args: unknown[]) => listIncomeRecords(...args),
  updateIncomeRecord: vi.fn(),
  deleteIncomeRecord: vi.fn(),
  createIncomeRecord: vi.fn(),
}))

function makeRecord(): DepartureIncomeRecordSummary {
  return {
    id: 'ir-1',
    departureId: 'dep-1',
    type: DepartureIncomeType.SHOPPING_REBATE,
    projectName: '玉器返利',
    partnerSupplierId: null,
    partnerSupplierName: null,
    occurredOn: '2026-07-29',
    amountCents: 20_000,
    guideSupplierId: null,
    guideSupplierName: null,
    commissionCents: 0,
    companyIncomeCents: 20_000,
    incomeStatus: DepartureIncomeCollectionStatus.UNCOLLECTED,
    commissionStatus: DepartureIncomeCommissionStatus.UNPAID,
    settlementComposite: DepartureIncomeSettlementComposite.PENDING_SETTLE,
    remark: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  }
}

function makeDeparture(): DepartureDetail {
  return {
    id: 'dep-1',
    departureNo: 'XTB2026070001',
    name: '增收原型收口团',
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
    totalGuests: 0,
    sourceOrderCount: 0,
    segmentCount: 0,
    resourceCount: 0,
    completionTags: {
      sourceOrders: '客源0单',
      segments: '行程0段',
      resources: '资源0项',
      receivables: '应收未提交',
      payables: '应付未提交',
    },
    grossReceivableCents: 0,
    fareAdjustmentNetCents: 0,
    discountCents: 0,
    netReceivableCents: 0,
    payableCents: 0,
    estimatedMarginCents: 0,
    canPurge: true,
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 0,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 0,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    overviewStats: {
      receivedCents: 0,
      openUnreceivedCents: 0,
      closedUnreceivedCents: 0,
      ungeneratedReceivableCents: 0,
      paidCents: 0,
      openUnpaidCents: 0,
      closedUnpaidCents: 0,
      ungeneratedPayableCents: 0,
      unverifiedIncomeCents: 0,
      unverifiedExpenseCents: 0,
      additionalIncomeNetCents: 20_000,
    },
    guideSupplierId: null,
    guideSupplierName: null,
    driverSupplierId: null,
    driverSupplierName: null,
    vehicleSupplierId: null,
    vehicleSupplierName: null,
  } as DepartureDetail
}

afterEach(() => {
  cleanup()
})

describe('IncomeRecordsPanel prototype removal (ADR-0036)', () => {
  beforeEach(() => {
    listIncomeRecords.mockReset()
    listIncomeRecords.mockResolvedValue({
      items: [makeRecord()],
      amountCentsTotal: 20_000,
      commissionCentsTotal: 0,
      companyIncomeCentsTotal: 20_000,
    })
  })

  it('does not show PrototypeSwitcher or A/B/C labels even when ?variant=A', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ConfigProvider locale={zhCN}>
          <App>
            <IncomeRecordsPanel departure={makeDeparture()} mutationLocked={false} />
          </App>
        </ConfigProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('玉器返利')).toBeInTheDocument()
    })

    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一方案')).not.toBeInTheDocument()
    expect(screen.queryByText(/当前方案/)).not.toBeInTheDocument()
    expect(screen.queryByText('结算泳道推进')).not.toBeInTheDocument()
    expect(screen.queryByText('类型优先录入台')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增/ })).toBeInTheDocument()
  })
})
