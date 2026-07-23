import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { buildTransactionColumns } from './create-verification-table-columns'

function makeTransaction(
  overrides: Partial<FinanceTransactionSummary> = {},
): FinanceTransactionSummary {
  return {
    id: 'tx-1',
    transactionNo: 'TXXTB20260722000003',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'cash',
    amountCents: 200000,
    allocatedAmountCents: 0,
    unallocatedAmountCents: 200000,
    transactionDate: '2026-07-22',
    counterpartyType: 'guest',
    counterpartyId: 'so-1',
    counterpartyName: '福建土楼专线地接 7月25日发客',
    departureId: 'dep-1',
    departureNo: 'XTB2026070001',
    departureName: '天吐喀伊10日',
    departureStatus: null,
    voidedAt: null,
    voidReason: null,
    notes: null,
    sourceAmountChanged: false,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('create-verification transaction columns counterparty display', () => {
  it('splits guest collection method from bare counterparty name', () => {
    const columns = buildTransactionColumns(
      new Map([['dep-1', { departureNo: 'XTB2026070001', name: '天吐喀伊10日' }]]),
    )
    render(
      <ConfigProvider>
        <Table
          rowKey="id"
          pagination={false}
          columns={columns}
          dataSource={[makeTransaction()]}
        />
      </ConfigProvider>,
    )

    expect(
      screen.getByRole('columnheader', { name: '收款方式 / 往来对象' }),
    ).toBeTruthy()
    const row = screen.getByText('TXXTB20260722000003').closest('tr')
    expect(row).toBeTruthy()
    expect(within(row!).getByText('游客代收')).toBeTruthy()
    expect(within(row!).getByText('福建土楼专线地接 7月25日发客')).toBeTruthy()
    expect(within(row!).queryByText(/游客代收\s*·/)).toBeNull()
  })
})
