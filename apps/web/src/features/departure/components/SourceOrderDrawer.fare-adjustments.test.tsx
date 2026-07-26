import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceOrderDrawer } from './SourceOrderDrawer'

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({
    items: [{ id: 'partner-1', name: '杭州同行' }],
    total: 1,
  })),
}))

vi.mock('@/services/source-order.service', () => ({
  getSourceOrder: vi.fn(),
}))

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <SourceOrderDrawer
          open
          editing={null}
          readOnly={false}
          loading={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrderDrawer fare adjustments', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps one direction select per adjustment row after add and kind change', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(screen.getByRole('button', { name: /添加调整项/ }))
    await user.click(screen.getByRole('button', { name: /添加调整项/ }))

    expect(screen.getAllByLabelText('删除团款调整项')).toHaveLength(2)

    const directionInputs = () =>
      document.querySelectorAll('input[id$="_direction"]')

    // 两行各一个方向 Select；幽灵节点会让数量 > 2
    expect(directionInputs().length).toBe(2)
    expect(
      [...directionInputs()].map((el) => (el as HTMLInputElement).id).sort(),
    ).toEqual(['fareAdjustments_0_direction', 'fareAdjustments_1_direction'])

    const kindSelect = document.querySelector('#fareAdjustments_0_kind')
    expect(kindSelect).toBeTruthy()
    await user.click(kindSelect!)
    await user.click(await screen.findByText('续住'))

    expect(directionInputs().length).toBe(2)

    const rows = [...document.querySelectorAll('div')].filter((el) =>
      (el.getAttribute('style') || '').includes('grid-template-columns'),
    )
    expect(rows.length).toBe(2)
    for (const row of rows) {
      const selects = within(row as HTMLElement).getAllByRole('combobox')
      // 非自定义行：种类 + 方向
      expect(selects.length).toBe(2)
    }
  })
})
