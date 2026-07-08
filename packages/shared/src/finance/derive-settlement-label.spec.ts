import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'
import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'
import { deriveSettlementLabel } from './derive-settlement-label'

describe('deriveSettlementLabel', () => {
  it('returns receivable settlement labels', () => {
    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        0,
        PaymentScheduleStatus.PENDING,
      ),
    ).toEqual({ label: '待收款', isOverdue: false })

    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        3000,
        PaymentScheduleStatus.PENDING,
      ),
    ).toEqual({ label: '部分收款', isOverdue: false })

    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        10000,
        PaymentScheduleStatus.SETTLED,
      ),
    ).toEqual({ label: '已收清', isOverdue: false })
  })

  it('returns payable settlement labels', () => {
    expect(
      deriveSettlementLabel(PaymentScheduleDirection.PAYABLE, 10000, 0, PaymentScheduleStatus.PENDING),
    ).toEqual({ label: '待付款', isOverdue: false })

    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.PAYABLE,
        10000,
        5000,
        PaymentScheduleStatus.OVERDUE,
      ),
    ).toEqual({ label: '部分付款', isOverdue: true })

    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.PAYABLE,
        10000,
        10000,
        PaymentScheduleStatus.SETTLED,
      ),
    ).toEqual({ label: '已付清', isOverdue: false })
  })

  it('returns cancelled label regardless of amounts', () => {
    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        5000,
        PaymentScheduleStatus.CANCELLED,
      ),
    ).toEqual({ label: '已关闭', isOverdue: false })
  })

  it('flags overdue without replacing settlement label', () => {
    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        0,
        PaymentScheduleStatus.OVERDUE,
      ),
    ).toEqual({ label: '待收款', isOverdue: true })
  })

  it('derives settled from amount even when status is pending', () => {
    expect(
      deriveSettlementLabel(
        PaymentScheduleDirection.RECEIVABLE,
        10000,
        12000,
        PaymentScheduleStatus.PENDING,
      ),
    ).toEqual({ label: '已收清', isOverdue: false })
  })
})
