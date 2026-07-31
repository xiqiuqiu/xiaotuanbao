/**
 * 增收记录文案与已结算色：发生日期→交易日期；综合状态→状态；已结算不上 success 绿。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { Form } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
  type DepartureIncomeRecordSummary,
} from '@xiaotuanbao/shared'
import { buildIncomeRecordsColumns } from './income-records-columns'
import { IncomeRecordsFilters } from './IncomeRecordsFilters'
import { IncomeRecordDrawer } from './IncomeRecordDrawer'

afterEach(() => {
  cleanup()
})

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))

describe('增收记录文案与状态色', () => {
  it('列表列标题为「状态」，已结算 Tag 用 default 而非 success', () => {
    const columns = buildIncomeRecordsColumns({
      mutationLocked: false,
      markPending: false,
      onEdit: vi.fn(),
      onMarkCollected: vi.fn(),
      onMarkPaid: vi.fn(),
      onDelete: vi.fn(),
    })
    const statusCol = columns.find((c) => c.dataIndex === 'settlementComposite')
    expect(statusCol?.title).toBe('状态')
    expect(statusCol?.title).not.toBe('综合状态')

    const record = {
      id: 'inc-1',
      type: DepartureIncomeType.SHOPPING_REBATE,
      settlementComposite: DepartureIncomeSettlementComposite.SETTLED,
    } as DepartureIncomeRecordSummary

    const { container } = render(
      <>{statusCol!.render?.(DepartureIncomeSettlementComposite.SETTLED, record, 0)}</>,
    )
    const tag = container.querySelector('.ant-tag')
    expect(tag?.textContent).toBe('已结算')
    expect(tag?.className).not.toMatch(/ant-tag-success/)
  })

  it('筛选下拉为「全部状态」，aria 为状态筛选', () => {
    render(
      <IncomeRecordsFilters
        typeFilter="all"
        compositeFilter="all"
        keyword=""
        onTypeChange={vi.fn()}
        onCompositeChange={vi.fn()}
        onKeywordChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('状态筛选')).toBeInTheDocument()
    expect(screen.getByText('全部状态')).toBeInTheDocument()
    expect(screen.queryByText('全部综合状态')).not.toBeInTheDocument()
  })

  it('抽屉日期字段文案为「交易日期」', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Host() {
      const [form] = Form.useForm()
      return (
        <IncomeRecordDrawer
          open
          editing={false}
          form={form}
          onClose={vi.fn()}
          onSave={vi.fn()}
          saving={false}
        />
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    )
    expect(screen.getByText('交易日期')).toBeInTheDocument()
    expect(screen.queryByText('发生日期')).not.toBeInTheDocument()
  })

  it('导游提成非必填；收入状态文案为「收账状态」', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Host() {
      const [form] = Form.useForm()
      return (
        <IncomeRecordDrawer
          open
          editing={false}
          form={form}
          onClose={vi.fn()}
          onSave={vi.fn()}
          saving={false}
        />
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    )

    const commissionLabel = screen.getByText('导游提成')
    expect(commissionLabel.closest('.ant-form-item-required')).toBeNull()
    expect(screen.getByText('收账状态')).toBeInTheDocument()
    expect(screen.queryByText('收入状态')).not.toBeInTheDocument()
  })

  it('列表含备注列', () => {
    const columns = buildIncomeRecordsColumns({
      mutationLocked: false,
      markPending: false,
      onEdit: vi.fn(),
      onMarkCollected: vi.fn(),
      onMarkPaid: vi.fn(),
      onDelete: vi.fn(),
    })
    expect(columns.some((c) => c.title === '备注' || c.dataIndex === 'remark')).toBe(true)
  })
})
