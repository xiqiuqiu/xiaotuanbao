import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
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
        <App>
          <SourceOrderDrawer
            open
            editing={null}
            readOnly={false}
            loading={false}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrderDrawer basic layout', () => {
  afterEach(() => {
    cleanup()
  })

  it('uses ~960 wide drawer for create', () => {
    renderDrawer()
    const wrapper = document.querySelector('.ant-drawer-content-wrapper') as HTMLElement | null
    expect(wrapper).toBeTruthy()
    expect(wrapper!.style.width).toBe('960px')
    expect(wrapper!.style.maxWidth).toBe('100vw')
  })

  it('exposes sticky anchor tabs for the main sections including guests placeholder', () => {
    renderDrawer()
    expect(screen.getByRole('tab', { name: '基础信息' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '团款调整' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '团款优惠' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '收款信息' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '客人名单' })).toBeTruthy()
  })

  it('omits section long descriptions and discount AmountPipeline', () => {
    renderDrawer()
    expect(screen.queryByText(/按人数与单价计算原始团款/)).toBeNull()
    expect(screen.queryByText(/加收或扣减项/)).toBeNull()
    expect(screen.queryByText(/按定金\/尾款录入代收约定/)).toBeNull()
    expect(screen.queryByText(/^原始 ¥/)).toBeNull()
  })

  it('shows settlement preview in the footer', () => {
    renderDrawer()
    expect(screen.getByText('团款结算')).toBeTruthy()
    expect(screen.getByText('代收约定')).toBeTruthy()
    expect(screen.getByText('预计差额')).toBeTruthy()
    expect(screen.getByText('结算金额')).toBeTruthy()
  })

  it('keeps 原始团款 in basics and notes after settlement notes', () => {
    renderDrawer()

    const adult = screen.getByLabelText('成人人数')
    const child = screen.getByLabelText('儿童人数')
    const total = screen.getByLabelText('总人数')
    const settlementNotes = screen.getByLabelText('结算说明')
    const notes = screen.getByLabelText('备注')

    expect(screen.getByLabelText('原始团款')).toBeTruthy()
    expect(screen.getAllByLabelText('备注')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('免票、特殊要求等')).toHaveLength(1)

    expect(adult.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(child.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      total.compareDocumentPosition(screen.getByLabelText('成人团款单价（元）')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      settlementNotes.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('highlights the clicked anchor tab and keeps section anchors in the DOM', async () => {
    const user = userEvent.setup()
    renderDrawer()

    expect(document.getElementById('so-section-basics')).toBeTruthy()
    expect(document.getElementById('so-section-fare')).toBeTruthy()
    expect(document.getElementById('so-section-discount')).toBeTruthy()
    expect(document.getElementById('so-section-collection')).toBeTruthy()
    expect(document.getElementById('so-section-guests')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: '团款调整' }))
    expect(screen.getByRole('tab', { name: '团款调整' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
