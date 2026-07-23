import { render, screen, within } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import {
  PaymentScheduleSourceType,
  deriveScheduleState,
  isFinanceTouched,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'

/**
 * 忠实模拟应收/应付的真实状态流转：每个状态都用后端同一套 shared 派生函数
 * （deriveScheduleState / isFinanceTouched）从原始事实算出 status/未结清/财务介入，
 * 再经真实列渲染断言列表显示正确性，避免手写 status 与实际功能脱节。
 */

const BUSINESS_DATE = '2026-07-20'
const FUTURE_DUE = '2026-08-10'
const PAST_DUE = '2026-07-01'

interface TransitionFacts {
  direction: 'payable' | 'receivable'
  amountCents: number
  /** 有效已核销金额（部分/全部核销、撤销核销归零均由此表达）。 */
  settledAmountCents: number
  dueDate?: string
  /** 关闭节点会写入 cancelledAt。 */
  cancelledAt?: string | null
  /** 明确调整约定金额会写入 amountAdjustedAt。 */
  amountAdjustedAt?: string | null
  /** 曾发生核销（含已撤销）——撤销核销后 settled 归零但财务履历仍在。 */
  hasVerificationHistory?: boolean
  identity: Partial<PaymentScheduleSummary>
}

/** 复刻后端 toSummary 的派生：unsettled / status / financeTouched 全部算出。 */
function deriveRow(facts: TransitionFacts): PaymentScheduleSummary {
  const cancelledAt = facts.cancelledAt ?? null
  const amountAdjustedAt = facts.amountAdjustedAt ?? null
  const dueDate = facts.dueDate ?? FUTURE_DUE
  const status = deriveScheduleState({
    amountCents: facts.amountCents,
    settledAmountCents: facts.settledAmountCents,
    dueDate,
    cancelledAt,
    businessDate: BUSINESS_DATE,
    direction: facts.direction,
  })
  const financeTouched = isFinanceTouched(
    { cancelledAt, amountAdjustedAt },
    facts.settledAmountCents,
    facts.hasVerificationHistory ?? false,
  )

  return {
    id: `sch-${Math.random().toString(36).slice(2)}`,
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: facts.direction,
    scheduleNo: 'PLACEHOLDER',
    title: '手工标题',
    amountCents: facts.amountCents,
    dueDate,
    counterpartyType: 'supplier',
    counterpartyId: 'cp-1',
    counterpartyName: '对手方',
    sourceType: PaymentScheduleSourceType.MANUAL,
    sourceId: null,
    resourceKind: null,
    resourceTitle: null,
    sourceOrderName: null,
    status,
    financeTouched,
    settledAmountCents: facts.settledAmountCents,
    unsettledAmountCents: Math.max(facts.amountCents - facts.settledAmountCents, 0),
    cancelledAt,
    cancelledBy: cancelledAt ? 'user-1' : null,
    closeDisposition: cancelledAt ? 'other' : null,
    cancelReason: cancelledAt ? '停止跟进' : null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...facts.identity,
  }
}

function renderList(
  isReceivable: boolean,
  rows: PaymentScheduleSummary[],
  voidedAudit = false,
) {
  const columns = buildPaymentScheduleColumns({
    isDepartureScope: true,
    isReceivable,
    readOnly: true,
    voidedAudit,
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

function row(scheduleNo: string): HTMLElement {
  const found = screen.getByText(scheduleNo).closest('tr')
  if (!found) {
    throw new Error(`row not found: ${scheduleNo}`)
  }
  return found
}

const RESOURCE_IDENTITY: Partial<PaymentScheduleSummary> = {
  sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
  sourceId: 'res-1',
  resourceKind: 'transport',
  resourceTitle: '杭州中亚旅游汽车',
  counterpartyType: 'supplier',
  counterpartyName: '杭州中亚旅汽',
}

const CUSTOMER_IDENTITY: Partial<PaymentScheduleSummary> = {
  sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
  sourceId: 'so-1',
  counterpartyType: 'partner',
  counterpartyName: '福建土楼专线地接',
  sourceOrderName: '福建土楼专线地接 7月15日发客',
}

const GUEST_IDENTITY: Partial<PaymentScheduleSummary> = {
  sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
  sourceId: 'so-2',
  counterpartyType: 'guest',
  counterpartyName: '苏州水乡地接社 7月15日发客',
  sourceOrderName: '苏州水乡地接社 7月15日发客',
}

describe('应付资源节点状态流转的列表显示', () => {
  it('待付款 → 部分付款 → 已付清 → 关闭(部分核销)', () => {
    const pending = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 0,
      identity: { ...RESOURCE_IDENTITY, scheduleNo: 'AP-PENDING' },
    })
    const partial = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 20000,
      identity: { ...RESOURCE_IDENTITY, scheduleNo: 'AP-PARTIAL' },
    })
    const settled = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 50000,
      identity: { ...RESOURCE_IDENTITY, scheduleNo: 'AP-SETTLED' },
    })
    const closed = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 20000,
      cancelledAt: '2026-07-18T00:00:00.000Z',
      identity: { ...RESOURCE_IDENTITY, scheduleNo: 'AP-CLOSED' },
    })

    renderList(false, [pending, partial, settled, closed])

    // 单号列文案为「应付单号」，资源来源列在各状态下保持一致。
    expect(screen.getByText('应付单号')).toBeTruthy()
    expect(screen.getByText('费用类别')).toBeTruthy()
    expect(screen.getByText('费用项目')).toBeTruthy()

    const pendingRow = row('AP-PENDING')
    expect(within(pendingRow).getByText('用车')).toBeTruthy()
    expect(within(pendingRow).getByText('杭州中亚旅游汽车')).toBeTruthy()
    expect(within(pendingRow).getByText('杭州中亚旅汽')).toBeTruthy()
    expect(within(pendingRow).getByText('待付款')).toBeTruthy()
    // 已结清 ¥0.00；金额与未结清同为 ¥500.00（两列）。
    expect(within(pendingRow).getByText('¥0.00')).toBeTruthy()
    expect(within(pendingRow).getAllByText('¥500.00').length).toBe(2)
    // 未介入：财务介入列为「-」，不显示「已介入」。
    expect(within(pendingRow).queryByText('已介入')).toBeNull()
    expect(within(pendingRow).getByText('-')).toBeTruthy()

    const partialRow = row('AP-PARTIAL')
    expect(within(partialRow).getByText('部分付款')).toBeTruthy()
    expect(within(partialRow).getByText('¥200.00')).toBeTruthy()
    expect(within(partialRow).getByText('¥300.00')).toBeTruthy()
    expect(within(partialRow).getByText('已介入')).toBeTruthy()

    const settledRow = row('AP-SETTLED')
    expect(within(settledRow).getByText('已付清')).toBeTruthy()
    expect(within(settledRow).getByText('已介入')).toBeTruthy()

    const closedRow = row('AP-CLOSED')
    // 关闭仍有未结清：付款状态保持「部分付款」并叠加「已关闭」标签。
    expect(within(closedRow).getByText('部分付款')).toBeTruthy()
    expect(within(closedRow).getByText('已关闭')).toBeTruthy()
    expect(within(closedRow).getByText('¥300.00')).toBeTruthy()
    expect(within(closedRow).getByText('已介入')).toBeTruthy()
  })

  it('关闭后撤销核销归零：财务履历仍在，显示待付款+已关闭+已介入', () => {
    const closedZero = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 0,
      hasVerificationHistory: true,
      cancelledAt: '2026-07-18T00:00:00.000Z',
      identity: { ...RESOURCE_IDENTITY, scheduleNo: 'AP-CLOSED-ZERO' },
    })
    renderList(false, [closedZero])

    const closedRow = row('AP-CLOSED-ZERO')
    expect(within(closedRow).getByText('待付款')).toBeTruthy()
    expect(within(closedRow).getByText('已关闭')).toBeTruthy()
    expect(within(closedRow).getByText('已介入')).toBeTruthy()
    // 撤销核销后已结清归零，金额与未结清同为 ¥500.00（两列）。
    expect(within(closedRow).getByText('¥0.00')).toBeTruthy()
    expect(within(closedRow).getAllByText('¥500.00').length).toBe(2)
  })

  it('作废节点在审计视图显示身份列与作废事实', () => {
    const voided = deriveRow({
      direction: 'payable',
      amountCents: 50000,
      settledAmountCents: 0,
      identity: {
        ...RESOURCE_IDENTITY,
        scheduleNo: 'AP-VOIDED',
        voidedAt: '2026-07-17T02:30:00.000Z',
        voidedByName: '王杰',
        voidReason: '供应商报价录入错误',
        voidedAmountCents: 50000,
      },
    })
    renderList(false, [voided], true)

    const voidedRow = row('AP-VOIDED')
    expect(within(voidedRow).getByText('用车')).toBeTruthy()
    expect(within(voidedRow).getByText('杭州中亚旅游汽车')).toBeTruthy()
    expect(within(voidedRow).getByText('王杰')).toBeTruthy()
    expect(within(voidedRow).getByText('供应商报价录入错误')).toBeTruthy()
    expect(within(voidedRow).getByText('¥500.00')).toBeTruthy()
  })
})

describe('应收客源节点状态流转的列表显示', () => {
  it('待收款(未逾期) → 已逾期 → 部分收款(逾期) → 已收清', () => {
    const pending = deriveRow({
      direction: 'receivable',
      amountCents: 450000,
      settledAmountCents: 0,
      dueDate: FUTURE_DUE,
      identity: { ...CUSTOMER_IDENTITY, scheduleNo: 'AR-PENDING' },
    })
    const overdue = deriveRow({
      direction: 'receivable',
      amountCents: 450000,
      settledAmountCents: 0,
      dueDate: PAST_DUE,
      identity: { ...CUSTOMER_IDENTITY, scheduleNo: 'AR-OVERDUE' },
    })
    const partialOverdue = deriveRow({
      direction: 'receivable',
      amountCents: 450000,
      settledAmountCents: 150000,
      dueDate: PAST_DUE,
      identity: { ...CUSTOMER_IDENTITY, scheduleNo: 'AR-PARTIAL' },
    })
    const collected = deriveRow({
      direction: 'receivable',
      amountCents: 450000,
      settledAmountCents: 450000,
      dueDate: PAST_DUE,
      identity: { ...CUSTOMER_IDENTITY, scheduleNo: 'AR-COLLECTED' },
    })

    renderList(true, [pending, overdue, partialOverdue, collected])

    expect(screen.getByText('应收单号')).toBeTruthy()
    expect(screen.getByText('来源客源单')).toBeTruthy()
    expect(screen.getByText('收款方式')).toBeTruthy()
    expect(screen.getByText('收款对象')).toBeTruthy()
    expect(screen.getByText('收款状态')).toBeTruthy()

    const pendingRow = row('AR-PENDING')
    expect(within(pendingRow).getByText('福建土楼专线地接 7月15日发客')).toBeTruthy()
    expect(within(pendingRow).getByText('客户补款')).toBeTruthy()
    // 客户补款收款对象为发客 Partner 名。
    expect(within(pendingRow).getByText('福建土楼专线地接')).toBeTruthy()
    expect(within(pendingRow).getByText('待收款')).toBeTruthy()
    expect(within(pendingRow).queryByText('已逾期')).toBeNull()

    const overdueRow = row('AR-OVERDUE')
    // 逾期：收款状态仍是「待收款」，叠加「已逾期」标签。
    expect(within(overdueRow).getByText('待收款')).toBeTruthy()
    expect(within(overdueRow).getByText('已逾期')).toBeTruthy()

    const partialRow = row('AR-PARTIAL')
    expect(within(partialRow).getByText('部分收款')).toBeTruthy()
    expect(within(partialRow).getByText('已逾期')).toBeTruthy()
    expect(within(partialRow).getByText('¥1,500.00')).toBeTruthy()
    expect(within(partialRow).getByText('¥3,000.00')).toBeTruthy()

    const collectedRow = row('AR-COLLECTED')
    // 已收清不再显示逾期。
    expect(within(collectedRow).getByText('已收清')).toBeTruthy()
    expect(within(collectedRow).queryByText('已逾期')).toBeNull()
  })

  it('游客代收：收款对象统一显示「游客」，关闭后叠加已关闭', () => {
    const guestPending = deriveRow({
      direction: 'receivable',
      amountCents: 300000,
      settledAmountCents: 0,
      identity: { ...GUEST_IDENTITY, scheduleNo: 'AR-GUEST' },
    })
    const guestClosed = deriveRow({
      direction: 'receivable',
      amountCents: 300000,
      settledAmountCents: 100000,
      cancelledAt: '2026-07-18T00:00:00.000Z',
      identity: { ...GUEST_IDENTITY, scheduleNo: 'AR-GUEST-CLOSED' },
    })

    renderList(true, [guestPending, guestClosed])

    const guestRow = row('AR-GUEST')
    expect(within(guestRow).getByText('游客代收')).toBeTruthy()
    expect(within(guestRow).getByText('游客')).toBeTruthy()
    expect(within(guestRow).getByText('苏州水乡地接社 7月15日发客')).toBeTruthy()
    expect(within(guestRow).getByText('待收款')).toBeTruthy()

    const closedRow = row('AR-GUEST-CLOSED')
    expect(within(closedRow).getByText('部分收款')).toBeTruthy()
    expect(within(closedRow).getByText('已关闭')).toBeTruthy()
    expect(within(closedRow).getByText('游客')).toBeTruthy()
  })
})
