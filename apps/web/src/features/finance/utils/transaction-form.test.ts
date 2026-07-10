import { CounterpartyType, PaymentChannel, TransactionDirection } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import { buildCreateTransactionPayload, type TransactionFormValues } from './transaction-form'

describe('buildCreateTransactionPayload', () => {
  it('keeps guest source-order id and optional display name', () => {
    const values: TransactionFormValues = {
      direction: TransactionDirection.INFLOW,
      paymentChannel: PaymentChannel.CASH,
      amountYuan: 99,
      transactionDate: undefined,
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: 'source-order-1',
      counterpartyName: 'Hngyu',
      departureId: 'dep-1',
    }

    expect(buildCreateTransactionPayload(values)).toMatchObject({
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: 'source-order-1',
      counterpartyName: 'Hngyu',
      departureId: 'dep-1',
    })
  })
})
