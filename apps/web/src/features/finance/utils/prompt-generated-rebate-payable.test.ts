import { describe, expect, it, vi, afterEach } from 'vitest'
import { Modal } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  buildGeneratedRebatePayableProcessNavigation,
  buildGeneratedRebatePayablePromptCopy,
  promptGeneratedRebatePayableFollowUp,
  shouldPromptGeneratedRebatePayable,
} from './prompt-generated-rebate-payable'

function rebate(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'rebate-1',
    departureId: 'dep-1',
    departureStatus: 'in_progress',
    direction: 'payable',
    scheduleNo: 'AP202607280001',
    title: '返利',
    amountCents: 190000,
    dueDate: '2026-08-01',
    counterpartyType: 'partner',
    counterpartyId: 'p1',
    counterpartyName: '同程',
    sourceType: 'source_order_rebate',
    sourceId: 'so-1',
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 190000,
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
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  }
}

describe('shouldPromptGeneratedRebatePayable', () => {
  it('is true only when rebate amount is positive', () => {
    expect(shouldPromptGeneratedRebatePayable(rebate())).toBe(true)
    expect(shouldPromptGeneratedRebatePayable(null)).toBe(false)
    expect(shouldPromptGeneratedRebatePayable(undefined)).toBe(false)
    expect(shouldPromptGeneratedRebatePayable(rebate({ amountCents: 0 }))).toBe(false)
  })
})

describe('buildGeneratedRebatePayablePromptCopy', () => {
  it('mentions schedule no and amount for finance follow-up', () => {
    const copy = buildGeneratedRebatePayablePromptCopy(rebate())
    expect(copy.title).toBe('已生成返利应付')
    expect(copy.content).toContain('AP202607280001')
    expect(copy.content).toContain('¥1,900.00')
    expect(copy.content).toContain('请财务处理付款')
  })
})

describe('promptGeneratedRebatePayableFollowUp', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens confirm with 去处理 / 稍后处理 and invokes onGoProcess on ok', () => {
    const onGoProcess = vi.fn()
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      config.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() } as ReturnType<typeof Modal.confirm>
    })

    promptGeneratedRebatePayableFollowUp(rebate(), onGoProcess)

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        okText: '去处理',
        cancelText: '稍后处理',
      }),
    )
    expect(onGoProcess).toHaveBeenCalledWith(expect.objectContaining({ scheduleNo: 'AP202607280001' }))
  })

  it('does not open modal when rebate was not generated', () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm')
    promptGeneratedRebatePayableFollowUp(null, vi.fn())
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('buildGeneratedRebatePayableProcessNavigation', () => {
  it('stays on departure payables tab with scheduleNo, not global /finance/payable', () => {
    const target = buildGeneratedRebatePayableProcessNavigation(
      rebate({ departureId: 'dep-42', scheduleNo: 'APX182607000003', sourceId: 'so-9' }),
    )
    expect(target).toEqual({
      to: '/departure/$departureId',
      params: { departureId: 'dep-42' },
      search: {
        tab: 'payables',
        scheduleNo: 'APX182607000003',
        highlightSourceOrderId: 'so-9',
      },
    })
    expect(target).not.toEqual(
      expect.objectContaining({ to: '/finance/payable' }),
    )
  })
})
