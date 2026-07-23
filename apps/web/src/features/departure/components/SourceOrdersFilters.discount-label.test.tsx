import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_SOURCE_ORDER_FILTERS } from '../utils/source-order-filter-state'
import { SourceOrdersFilters } from './SourceOrdersFilters'

describe('SourceOrdersFilters discount filter copy', () => {
  it('defaults to watermark 优惠状态 and offers 全部 instead of 全部优惠', async () => {
    const user = userEvent.setup()

    render(
      <ConfigProvider>
        <SourceOrdersFilters
          draft={EMPTY_SOURCE_ORDER_FILTERS}
          partnerOptions={[]}
          onDraftChange={vi.fn()}
          onApply={vi.fn()}
          onReset={vi.fn()}
        />
      </ConfigProvider>,
    )

    const discountSelect = screen.getByRole('combobox', { name: '优惠状态' })
    expect(screen.queryByText('全部优惠')).not.toBeInTheDocument()

    // 默认未选具体优惠条件时展示水印，表示全部数据
    expect(within(discountSelect.closest('.ant-select')!).getByText('优惠状态')).toBeInTheDocument()

    await user.click(discountSelect)

    expect(await screen.findByRole('option', { name: '全部' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '有优惠' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '全部优惠' })).not.toBeInTheDocument()
  })
})
