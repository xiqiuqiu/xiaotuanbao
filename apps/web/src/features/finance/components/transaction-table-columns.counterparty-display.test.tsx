import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    transactionNo: 'TXXTB20260722000003',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'cash',
    amountCents: 200000,
    allocatedAmountCents: 200000,
    unallocatedAmountCents: 0,
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

function renderTable(rows: FinanceTransactionSummary[]) {
  const columns = buildTransactionColumns({
    isDepartureScope: true,
    readOnly: true,
    onOpenDetail: vi.fn(),
    onOpenVerify: vi.fn(),
    onEdit: vi.fn(),
    onOpenVoidModal: vi.fn(),
    onViewVerifications: vi.fn(),
  })
  return render(
    <ConfigProvider>
      <Table rowKey="id" pagination={false} columns={columns} dataSource={rows} />
    </ConfigProvider>,
  )
}

function rowOf(transactionNo: string): HTMLElement {
  const cell = screen.getByText(transactionNo)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`row not found for ${transactionNo}`)
  }
  return row
}

afterEach(() => {
  cleanup()
})

describe('buildTransactionColumns counterparty display', () => {
  it('splits guest collection into 收款方式 and bare 往来对象 (no type·name concat)', () => {
    renderTable([makeTransaction()])

    expect(screen.getByRole('columnheader', { name: '收款方式' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '往来对象' })).toBeTruthy()

    const row = rowOf('TXXTB20260722000003')
    expect(within(row).getByText('游客代收')).toBeTruthy()
    expect(within(row).getByText('福建土楼专线地接 7月25日发客')).toBeTruthy()
    expect(within(row).queryByText(/游客代收\s*·/)).toBeNull()
  })

  it('shows partner type as 收款方式 and partner name as 往来对象', () => {
    renderTable([
      makeTransaction({
        id: 'tx-2',
        transactionNo: 'TXXTB20260722000004',
        counterpartyType: 'partner',
        counterpartyId: 'p-1',
        counterpartyName: '浙旅集团杭州分公司',
      }),
    ])

    const row = rowOf('TXXTB20260722000004')
    expect(within(row).getByText('合作伙伴')).toBeTruthy()
    expect(within(row).getByText('浙旅集团杭州分公司')).toBeTruthy()
    expect(within(row).queryByText(/合作伙伴\s*·/)).toBeNull()
  })
})
