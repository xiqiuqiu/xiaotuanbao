import { cleanup, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VerificationStatus,
  type FinanceVerificationListItem,
} from '@xiaotuanbao/shared'
import { buildVerificationColumns } from './verification-table-columns'

function makeVerification(
  overrides: Partial<FinanceVerificationListItem> = {},
): FinanceVerificationListItem {
  return {
    id: 'vr-1',
    verificationNo: 'CLXTB20260722000001',
    paymentScheduleId: 'sch-1',
    transactionId: 'tx-1',
    amountCents: 200000,
    verificationDate: '2026-07-22',
    status: VerificationStatus.NORMAL,
    billUnsettledAfterCents: 0,
    remark: null,
    createdBy: 'u-1',
    cancelledBy: null,
    cancelReason: null,
    cancelledAt: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    transactionNo: 'TXXTB20260722000003',
    scheduleNo: 'ARXTB20260722000001',
    direction: 'receivable',
    departureId: 'dep-1',
    departureNo: 'XTB2026070001',
    departureName: '天吐喀伊10日',
    counterpartyType: 'guest',
    counterpartyName: '福建土楼专线地接 7月25日发客',
    createdByName: '阿财',
    cancelledByName: null,
    ...overrides,
  }
}

function renderTable(rows: FinanceVerificationListItem[]) {
  const columns = buildVerificationColumns({
    isDepartureScope: true,
    readOnly: true,
    onOpenDetail: vi.fn(),
    onOpenCancelModal: vi.fn(),
  })
  return render(
    <ConfigProvider>
      <Table rowKey="id" pagination={false} columns={columns} dataSource={rows} />
    </ConfigProvider>,
  )
}

function rowOf(verificationNo: string): HTMLElement {
  const cell = screen.getByText(verificationNo)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`row not found for ${verificationNo}`)
  }
  return row
}

afterEach(() => {
  cleanup()
})

describe('buildVerificationColumns counterparty display', () => {
  it('splits guest collection into 收款方式 and bare 往来对象 (no type·name concat)', () => {
    renderTable([makeVerification()])

    expect(screen.getByRole('columnheader', { name: '收款方式' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '往来对象' })).toBeTruthy()

    const row = rowOf('CLXTB20260722000001')
    expect(within(row).getByText('游客代收')).toBeTruthy()
    expect(within(row).getByText('福建土楼专线地接 7月25日发客')).toBeTruthy()
    expect(within(row).queryByText(/游客代收\s*·/)).toBeNull()
  })

  it('uses screenshot-aligned terminology for verification list headers', () => {
    renderTable([makeVerification()])

    for (const name of [
      '核销类型',
      '关联流水单号',
      '关联账款单号',
      '账款剩余未结金额',
      '核销状态',
      '操作人',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('columnheader', { name: '核销方向' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '核销人' })).toBeNull()
  })
})
