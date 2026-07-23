import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_SOURCE_ORDER_FILTERS } from '../utils/source-order-filter-state'
import { SourceOrdersFilters } from './SourceOrdersFilters'

describe('SourceOrdersFilters enter-to-search', () => {
  it('pressing Enter in the keyword input applies filters (same as 查询)', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <ConfigProvider>
        <SourceOrdersFilters
          draft={{ ...EMPTY_SOURCE_ORDER_FILTERS, keyword: '思达' }}
          partnerOptions={[]}
          onDraftChange={vi.fn()}
          onApply={onApply}
          onReset={vi.fn()}
        />
      </ConfigProvider>,
    )

    const keywordInput = screen.getByRole('textbox', { name: '搜索客户名称、备注' })
    await user.click(keywordInput)
    await user.keyboard('{Enter}')

    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
