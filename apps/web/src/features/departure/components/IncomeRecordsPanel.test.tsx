import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const listIncomeRecords = vi.fn()
const updateIncomeRecord = vi.fn()
const deleteIncomeRecord = vi.fn()
const createIncomeRecord = vi.fn()

vi.mock('@/services/income-record.service', () => ({
  listIncomeRecords: (...args: unknown[]) => listIncomeRecords(...args),
  updateIncomeRecord: (...args: unknown[]) => updateIncomeRecord(...args),
  deleteIncomeRecord: (...args: unknown[]) => deleteIncomeRecord(...args),
  createIncomeRecord: (...args: unknown[]) => createIncomeRecord(...args),
}))

function makeRecord(
  overrides: Partial<DepartureIncomeRecordSummary> = {},
): DepartureIncomeRecordSummary {
  return {
    id: 'ir-1',
    departureId: 'dep-1',
    type: DepartureIncomeType.SHOPPING_REBATE,
    projectName: '玉器返利',
    partnerSupplierId: 'sup-1',
    partnerSupplierName: '购物店甲',
    occurredOn: '2026-07-29',
    amountCents: 20_000,
    guideSupplierId: null,
    guideSupplierName: null,
    commissionCents: 5_000,
    companyIncomeCents: 15_000,
    incomeStatus: DepartureIncomeCollectionStatus.UNCOLLECTED,
    commissionStatus: DepartureIncomeCommissionStatus.UNPAID,
    settlementComposite: DepartureIncomeSettlementComposite.PENDING_SETTLE,
    remark: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  }
}

function makeDeparture(): DepartureDetail {
  return {
    id: 'dep-1',
    departureNo: 'XTB2026070001',
    name: '增收结算 UX 团',
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
    canPurge: false,
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
      additionalIncomeNetCents: 15_000,
    },
    guideSupplierId: null,
    guideSupplierName: null,
    driverSupplierId: null,
    driverSupplierName: null,
    vehicleSupplierId: null,
    vehicleSupplierName: null,
  } as DepartureDetail
}

function renderPanel(mutationLocked = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider locale={zhCN}>
        <App>
          <IncomeRecordsPanel departure={makeDeparture()} mutationLocked={mutationLocked} />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('IncomeRecordsPanel settlement UX', () => {
  beforeEach(() => {
    listIncomeRecords.mockReset()
    updateIncomeRecord.mockReset()
    deleteIncomeRecord.mockReset()
    createIncomeRecord.mockReset()
    listIncomeRecords.mockResolvedValue({
      items: [makeRecord()],
      amountCentsTotal: 20_000,
      commissionCentsTotal: 5_000,
      companyIncomeCentsTotal: 15_000,
    })
    updateIncomeRecord.mockImplementation(
      async (_departureId: string, _id: string, payload: Partial<DepartureIncomeRecordSummary>) =>
        makeRecord({
          ...payload,
          settlementComposite:
            payload.incomeStatus === DepartureIncomeCollectionStatus.COLLECTED &&
            (payload.commissionStatus ?? DepartureIncomeCommissionStatus.UNPAID) ===
              DepartureIncomeCommissionStatus.UNPAID
              ? DepartureIncomeSettlementComposite.PENDING_COMMISSION
              : DepartureIncomeSettlementComposite.PENDING_SETTLE,
        }),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('shows 标记已收 and 标记已付 when uncollected with commission > 0', async () => {
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('玉器返利')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '标记已收' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '标记已付' })).toBeInTheDocument()
    expect(screen.getByText('待结算')).toBeInTheDocument()
  })

  it('hides 标记已付 when commission is zero', async () => {
    listIncomeRecords.mockResolvedValue({
      items: [
        makeRecord({
          id: 'ir-zero',
          commissionCents: 0,
          companyIncomeCents: 20_000,
        }),
      ],
      amountCentsTotal: 20_000,
      commissionCentsTotal: 0,
      companyIncomeCentsTotal: 20_000,
    })
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('玉器返利')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '标记已收' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '标记已付' })).not.toBeInTheDocument()
  })

  it('marks collected via update and keeps filter totals aligned with list', async () => {
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('玉器返利')).toBeInTheDocument()
    })
    const summaryRow = () => screen.getByText('合计').closest('tr') as HTMLElement
    expect(within(summaryRow()).getByText('¥200.00')).toBeInTheDocument()
    expect(within(summaryRow()).getByText('¥50.00')).toBeInTheDocument()
    expect(within(summaryRow()).getByText('¥150.00')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '增收结算汇总' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '标记已收' }))
    await waitFor(() => {
      expect(updateIncomeRecord).toHaveBeenCalledWith('dep-1', 'ir-1', {
        incomeStatus: DepartureIncomeCollectionStatus.COLLECTED,
      })
    })

    listIncomeRecords.mockResolvedValue({
      items: [
        makeRecord({
          incomeStatus: DepartureIncomeCollectionStatus.COLLECTED,
          settlementComposite: DepartureIncomeSettlementComposite.PENDING_COMMISSION,
        }),
      ],
      amountCentsTotal: 20_000,
      commissionCentsTotal: 5_000,
      companyIncomeCentsTotal: 15_000,
    })

    const search = screen.getByPlaceholderText('项目名称 / 备注 / 合作方')
    await user.type(search, '购物店甲')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(listIncomeRecords).toHaveBeenCalledWith(
        'dep-1',
        { keyword: '购物店甲' },
        expect.anything(),
      )
    })

    expect(within(summaryRow()).getByText('¥200.00')).toBeInTheDocument()
    expect(within(summaryRow()).getByText('¥50.00')).toBeInTheDocument()
    expect(within(summaryRow()).getByText('¥150.00')).toBeInTheDocument()
  })

  it('检索后接表格，表尾合计对齐金额列，无顶部统计条', async () => {
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('玉器返利')).toBeInTheDocument()
    })

    const filters = screen.getByPlaceholderText('项目名称 / 备注 / 合作方')
    const table = screen.getByRole('table')
    const summary = screen.getByText('合计')

    expect(screen.queryByRole('list', { name: '增收结算汇总' })).not.toBeInTheDocument()
    expect(
      filters.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(table.contains(summary)).toBe(true)
    expect(screen.getByText('新增').closest('button')).toBeTruthy()
    expect(screen.queryByText('增收明细')).not.toBeInTheDocument()
  })
})