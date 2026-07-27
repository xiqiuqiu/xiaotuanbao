import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaymentScheduleDetail } from '@xiaotuanbao/shared'
import { PaymentScheduleDetailDrawer } from './PaymentScheduleDetailDrawer'

const getReceivable = vi.fn()
const getPayable = vi.fn()

vi.mock('@/services/finance.service', () => ({
  getReceivable: (...args: unknown[]) => getReceivable(...args),
  getPayable: (...args: unknown[]) => getPayable(...args),
}))

function renderDetail(isReceivable: boolean, scheduleId = 'sch-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <PaymentScheduleDetailDrawer
          open
          scheduleId={scheduleId}
          isReceivable={isReceivable}
          onClose={vi.fn()}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PaymentScheduleDetailDrawer identity', () => {
  it('aligns receivable identity with list language and values', async () => {
    getReceivable.mockResolvedValue({
      id: 'sch-1',
      departureId: 'dep-1',
      departureStatus: 'editing',
      direction: 'receivable',
      scheduleNo: 'ARXTB202607000482',
      title: '尾款代收',
      amountCents: 738000,
      dueDate: '2026-08-10',
      counterpartyType: 'guest',
      counterpartyId: 'so-1',
      counterpartyName: '黄山徽行天下地接',
      sourceType: 'source_order_guest_balance_collection',
      sourceId: 'so-1',
      sourceOrderName: '黄山徽行天下地接',
      status: 'pending',
      financeTouched: false,
      settledAmountCents: 0,
      unsettledAmountCents: 738000,
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
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      activities: [],
    } satisfies PaymentScheduleDetail)

    renderDetail(true)

    expect(await screen.findByText('ARXTB202607000482')).toBeTruthy()
    expect(screen.getByText('应收单详情')).toBeTruthy()
    expect(screen.getByText('应收单号')).toBeTruthy()
    expect(screen.getByText('来源客源单')).toBeTruthy()
    expect(screen.getByText('收款方式')).toBeTruthy()
    expect(screen.getByText('收款对象')).toBeTruthy()
    expect(screen.getByText('尾款代收')).toBeTruthy()
    expect(screen.getByText('游客')).toBeTruthy()
    expect(screen.getByText('黄山徽行天下地接')).toBeTruthy()
    expect(screen.getByText('到期日')).toBeTruthy()
    expect(screen.getByText('2026-08-10')).toBeTruthy()
    expect(screen.queryByText('应收节点详情')).toBeNull()
    expect(screen.queryByText('节点编号')).toBeNull()
    expect(screen.queryByText('标题')).toBeNull()
  })

  it('aligns payable identity with list language and values', async () => {
    getPayable.mockResolvedValue({
      id: 'sch-2',
      departureId: 'dep-1',
      departureStatus: 'editing',
      direction: 'payable',
      scheduleNo: 'APXTB202607000001',
      title: '酒店资源应付',
      amountCents: 160000,
      dueDate: '2026-07-20',
      counterpartyType: 'supplier',
      counterpartyId: 'sup-1',
      counterpartyName: '测试酒店',
      sourceType: 'segment_resource',
      sourceId: 'res-1',
      resourceKind: 'hotel',
      resourceTitle: '黄山悦榕庄',
      sourceOrderName: null,
      status: 'pending',
      financeTouched: false,
      settledAmountCents: 0,
      unsettledAmountCents: 160000,
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
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      activities: [],
    } satisfies PaymentScheduleDetail)

    renderDetail(false, 'sch-2')

    expect(await screen.findByText('APXTB202607000001')).toBeTruthy()
    expect(screen.getByText('应付单详情')).toBeTruthy()
    expect(screen.getByText('应付单号')).toBeTruthy()
    expect(screen.getByText('费用类别')).toBeTruthy()
    expect(screen.getByText('费用项目')).toBeTruthy()
    expect(screen.getByText('付款对象')).toBeTruthy()
    expect(screen.getByText('酒店')).toBeTruthy()
    expect(screen.getByText('黄山悦榕庄')).toBeTruthy()
    expect(screen.getByText('测试酒店')).toBeTruthy()
  })
})
