import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: 'payable',
    scheduleNo: 'APXTB202607000001',
    title: '手工标题',
    amountCents: 50000,
    dueDate: '2026-08-10',
    counterpartyType: 'supplier',
    counterpartyId: 'sup-1',
    counterpartyName: '杭州中亚旅汽',
    sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
    sourceId: 'res-1',
    resourceKind: null,
    resourceTitle: null,
    sourceOrderName: null,
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 50000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  }
}

function renderTable(isReceivable: boolean, rows: PaymentScheduleSummary[]) {
  const columns = buildPaymentScheduleColumns({
    isDepartureScope: true,
    isReceivable,
    readOnly: true,
    departureMap: new Map(),
    onConfirm: vi.fn(),
    onVerify: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onReopen: vi.fn(),
    onAdjustAmount: vi.fn(),
    onViewDetail: vi.fn(),
    onViewVerifications: vi.fn(),
  })
  return render(
    <ConfigProvider>
      <Table rowKey="id" pagination={false} columns={columns} dataSource={rows} />
    </ConfigProvider>,
  )
}

function rowOf(scheduleNo: string): HTMLElement {
  const cell = screen.getByText(scheduleNo)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`row not found for ${scheduleNo}`)
  }
  return row
}

afterEach(() => {
  cleanup()
})

describe('payable list columns', () => {
  it('shows fee category / fee item from the live resource and payee name', () => {
    renderTable(false, [
      schedule({
        scheduleNo: 'AP-RES',
        resourceKind: 'transport',
        resourceTitle: '杭州中亚旅游汽车',
      }),
    ])
    expect(screen.getByText('应付单号')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '付款对象' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '付款状态' })).toBeTruthy()
    const row = rowOf('AP-RES')
    expect(within(row).getByText('用车')).toBeTruthy()
    expect(within(row).getByText('杭州中亚旅游汽车')).toBeTruthy()
    expect(within(row).getByText('杭州中亚旅汽')).toBeTruthy()
  })

  it('falls back fee item to resource kind when resource title empty', () => {
    renderTable(false, [
      schedule({ scheduleNo: 'AP-NOTITLE', resourceKind: 'hotel', resourceTitle: null }),
    ])
    const row = rowOf('AP-NOTITLE')
    const kindCells = within(row).getAllByText('酒店')
    expect(kindCells.length).toBe(2)
  })

  it('shows dash category and title fallback for manual other-payable rows', () => {
    renderTable(false, [
      schedule({
        scheduleNo: 'AP-MANUAL',
        sourceType: PaymentScheduleSourceType.MANUAL,
        sourceId: null,
        title: '其他应付项目',
      }),
    ])
    const row = rowOf('AP-MANUAL')
    expect(within(row).getByText('其他应付项目')).toBeTruthy()
    // 费用类别对手工行为空态「-」（本行可能存在多个「-」，如财务介入列）。
    expect(within(row).getAllByText('-').length).toBeGreaterThan(0)
  })
})

describe('receivable list columns', () => {
  it('shows source order, customer-settlement method and partner payer without a title column', () => {
    renderTable(true, [
      schedule({
        direction: 'receivable',
        scheduleNo: 'AR-CUST',
        // 客源单路径的 title 与收款方式同源（客户补款/游客代收），列表不应再露标题列。
        title: '客户补款',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        sourceId: 'so-1',
        counterpartyType: 'partner',
        counterpartyName: '福建土楼专线地接',
        sourceOrderName: '福建土楼专线地接 7月15日发客',
      }),
    ])
    expect(screen.getByText('应收单号')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: '标题' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: '来源客源单' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '收款方式' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '收款对象' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '收款状态' })).toBeTruthy()
    const row = rowOf('AR-CUST')
    expect(within(row).getByText('福建土楼专线地接 7月15日发客')).toBeTruthy()
    expect(within(row).getByText('客户补款')).toBeTruthy()
    expect(within(row).getByText('福建土楼专线地接')).toBeTruthy()
  })

  it('does not expose a dedicated title column on payable or receivable lists', () => {
    renderTable(false, [schedule({ scheduleNo: 'AP-NO-TITLE-COL' })])
    expect(screen.queryByRole('columnheader', { name: '标题' })).toBeNull()
    cleanup()
    renderTable(true, [
      schedule({
        direction: 'receivable',
        scheduleNo: 'AR-NO-TITLE-COL',
        title: '尾款代收',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        sourceId: 'so-2',
        counterpartyType: 'guest',
        counterpartyName: '苏州水乡地接社 7月15日发客',
        sourceOrderName: '苏州水乡地接社 7月15日发客',
      }),
    ])
    expect(screen.queryByRole('columnheader', { name: '标题' })).toBeNull()
  })

  it('shows generic 游客 counterparty for guest-collection rows', () => {
    renderTable(true, [
      schedule({
        direction: 'receivable',
        scheduleNo: 'AR-GUEST',
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        sourceId: 'so-2',
        counterpartyType: 'guest',
        counterpartyName: '苏州水乡地接社 7月15日发客',
        sourceOrderName: '苏州水乡地接社 7月15日发客',
      }),
    ])
    const row = rowOf('AR-GUEST')
    expect(within(row).getByText('尾款代收')).toBeTruthy()
    expect(within(row).getByText('游客')).toBeTruthy()
  })

  it('shows 其他 method for manual other-receivable rows', () => {
    renderTable(true, [
      schedule({
        direction: 'receivable',
        scheduleNo: 'AR-MANUAL',
        sourceType: PaymentScheduleSourceType.MANUAL,
        sourceId: null,
        counterpartyType: 'partner',
        counterpartyName: '某渠道',
        sourceOrderName: null,
      }),
    ])
    const row = rowOf('AR-MANUAL')
    expect(within(row).getByText('其他')).toBeTruthy()
    expect(within(row).getByText('某渠道')).toBeTruthy()
  })
})
