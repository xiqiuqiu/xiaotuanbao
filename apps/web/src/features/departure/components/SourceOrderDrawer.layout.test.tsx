import { cleanup, render, screen } from '@testing-library/react'
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

describe('SourceOrderDrawer basic layout', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows 总人数 beside guest counts and keeps a single 备注 after 结算说明', () => {
    renderDrawer()

    const adult = screen.getByLabelText('成人人数')
    const child = screen.getByLabelText('儿童人数')
    const total = screen.getByLabelText('总人数')
    const settlementNotes = screen.getByLabelText('结算说明')
    const notes = screen.getByLabelText('备注')

    expect(screen.getAllByLabelText('备注')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('免票、特殊要求等')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '备注' })).toBeTruthy()

    // 总人数与成/儿童同区：位于成人之后、团款单价之前
    expect(adult.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(child.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      total.compareDocumentPosition(screen.getByLabelText('成人团款单价（元）')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // 通用备注在表单末尾（结算说明之后）
    expect(
      settlementNotes.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
