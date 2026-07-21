import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import {
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { buildTransactionColumns } from './transaction-table-columns'

function makeTransaction(
  overrides: Partial<FinanceTransactionSummary> = {},
): FinanceTransactionSummary {
  return {
    id: 'tx-1',
    transactionNo: 'TX202607000001',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'bank_transfer',
    amountCents: 50000,
    allocatedAmountCents: 0,
    unallocatedAmountCents: 50000,
    transactionDate: '2026-07-15',
    counterpartyType: 'guest',
    counterpartyId: 'so-1',
    counterpartyName: '杭州同行',
    departureId: 'dep-1',
    departureNo: 'XTB2026070001',
    departureName: '乌镇一团',
    departureStatus: null,
    voidedAt: null,
    voidReason: null,
    notes: null,
    sourceAmountChanged: false,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildTransactionColumns source amount change', () => {
  it('renders 客源金额已变更 tag when flagged', () => {
    const columns = buildTransactionColumns({
      isDepartureScope: true,
      readOnly: false,
      onOpenDetail: vi.fn(),
      onOpenVerify: vi.fn(),
      onEdit: vi.fn(),
      onOpenVoidModal: vi.fn(),
      onViewVerifications: vi.fn(),
    })
    const statusColumn = columns.find((column) => column.title === '流水状态')
    expect(statusColumn?.render).toBeTypeOf('function')

    render(
      <ConfigProvider>
        {statusColumn?.render?.(null, makeTransaction({ sourceAmountChanged: true }), 0)}
      </ConfigProvider>,
    )

    expect(screen.getByText('客源金额已变更')).toBeInTheDocument()
  })
})
