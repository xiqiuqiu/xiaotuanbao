import { render, screen } from '@testing-library/react'
import { ConfigProvider, Table } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'

const voidedSchedule: PaymentScheduleSummary = {
  id: 'schedule-voided',
  departureId: 'departure-1',
  departureStatus: 'editing',
  direction: 'payable',
  scheduleNo: 'APXTB202607000001',
  title: '酒店资源应付',
  amountCents: 160000,
  dueDate: '2026-07-20',
  counterpartyType: 'supplier',
  counterpartyId: 'supplier-1',
  counterpartyName: '测试酒店',
  sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
  sourceId: 'resource-1',
  resourceKind: 'hotel',
  resourceTitle: '西湖国宾馆',
  sourceOrderName: null,
  status: 'pending',
  financeTouched: false,
  settledAmountCents: 0,
  unsettledAmountCents: 160000,
  cancelledAt: null,
  cancelledBy: null,
  closeDisposition: null,
  cancelReason: null,
  voidedAt: '2026-07-15T02:30:00.000Z',
  voidedBy: 'user-1',
  voidedByName: '王杰',
  voidReason: '供应商报价录入错误',
  voidedAmountCents: 160000,
  amountAdjustedAt: null,
  createdAt: '2026-07-15T01:00:00.000Z',
  updatedAt: '2026-07-15T02:30:00.000Z',
}

describe('voided payable audit columns', () => {
  it('shows complete audit facts without mutation actions', () => {
    const onConfirm = vi.fn()
    const columns = buildPaymentScheduleColumns({
      isDepartureScope: true,
      isReceivable: false,
      readOnly: false,
      voidedAudit: true,
      departureMap: new Map(),
      onConfirm,
      onVerify: vi.fn(),
      onEdit: vi.fn(),
      onCancel: vi.fn(),
      onReopen: vi.fn(),
      onAdjustAmount: vi.fn(),
      onViewDetail: vi.fn(),
      onViewVerifications: vi.fn(),
    })

    render(
      <ConfigProvider>
        <Table
          rowKey="id"
          pagination={false}
          columns={columns}
          dataSource={[voidedSchedule]}
        />
      </ConfigProvider>,
    )

    expect(screen.getByText('APXTB202607000001')).toBeTruthy()
    expect(screen.getByText('酒店')).toBeTruthy()
    expect(screen.getByText('西湖国宾馆')).toBeTruthy()
    expect(screen.getByText('测试酒店')).toBeTruthy()
    expect(screen.getByText('¥1,600.00')).toBeTruthy()
    expect(screen.getByText('王杰')).toBeTruthy()
    expect(screen.getByText('供应商报价录入错误')).toBeTruthy()
    expect(screen.getByText('2026-07-15 10:30')).toBeTruthy()
    expect(screen.queryByText('登记付款')).toBeNull()
    expect(screen.queryByText('匹配流水')).toBeNull()
    expect(screen.queryByText('更多')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
