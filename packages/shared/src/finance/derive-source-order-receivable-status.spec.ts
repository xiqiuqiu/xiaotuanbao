import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'
import { SourceOrderReceivableStatus } from '../enums/source-order-receivable-status.enum'
import { deriveSourceOrderReceivableStatus } from './derive-source-order-receivable-status'

describe('deriveSourceOrderReceivableStatus', () => {
  it('is PARTIAL when deposit node is fully settled but balance node is still open', () => {
    expect(
      deriveSourceOrderReceivableStatus([
        {
          amountCents: 200000,
          settledAmountCents: 200000,
          status: PaymentScheduleStatus.SETTLED,
        },
        {
          amountCents: 290000,
          settledAmountCents: 0,
          status: PaymentScheduleStatus.PENDING,
        },
      ]),
    ).toBe(SourceOrderReceivableStatus.PARTIAL)
  })

  it('is PARTIAL when a single node is partially settled', () => {
    expect(
      deriveSourceOrderReceivableStatus([
        {
          amountCents: 500000,
          settledAmountCents: 100000,
          status: PaymentScheduleStatus.PENDING,
        },
      ]),
    ).toBe(SourceOrderReceivableStatus.PARTIAL)
  })

  it('is PENDING when no node has settled amount', () => {
    expect(
      deriveSourceOrderReceivableStatus([
        {
          amountCents: 200000,
          settledAmountCents: 0,
          status: PaymentScheduleStatus.PENDING,
        },
        {
          amountCents: 290000,
          settledAmountCents: 0,
          status: PaymentScheduleStatus.PENDING,
        },
      ]),
    ).toBe(SourceOrderReceivableStatus.PENDING)
  })

  it('is COLLECTED when every node is settled', () => {
    expect(
      deriveSourceOrderReceivableStatus([
        {
          amountCents: 200000,
          settledAmountCents: 200000,
          status: PaymentScheduleStatus.SETTLED,
        },
        {
          amountCents: 290000,
          settledAmountCents: 290000,
          status: PaymentScheduleStatus.SETTLED,
        },
      ]),
    ).toBe(SourceOrderReceivableStatus.COLLECTED)
  })
})
