import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentScheduleDetail } from '@xiaotuanbao/shared'
import { PaymentScheduleDetailDrawer } from './PaymentScheduleDetailDrawer'

const getPayable = vi.fn()

vi.mock('@/services/finance.service', () => ({
  getPayable: (...args: unknown[]) => getPayable(...args),
  getReceivable: vi.fn(),
}))

describe('PaymentScheduleDetailDrawer voided audit', () => {
  it('shows void audit facts without active settlement semantics', async () => {
    getPayable.mockResolvedValue({
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
      sourceType: 'segment_resource',
      sourceId: 'resource-1',
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
      activities: [],
    } satisfies PaymentScheduleDetail)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <PaymentScheduleDetailDrawer
            open
            scheduleId="schedule-voided"
            isReceivable={false}
            onClose={vi.fn()}
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('已作废')).toBeTruthy()
    expect(screen.getByText('王杰')).toBeTruthy()
    expect(screen.getByText('供应商报价录入错误')).toBeTruthy()
    expect(screen.queryByText('待付款')).toBeNull()
    expect(screen.queryByText('未关闭')).toBeNull()
    expect(screen.queryByText('未结清')).toBeNull()
  })
})
