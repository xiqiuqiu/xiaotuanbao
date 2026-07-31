import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, App } from 'antd'
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
  listSourceOrderGuests: vi.fn(async () => []),
}))

function renderDrawer(
  props: Partial<React.ComponentProps<typeof SourceOrderDrawer>> = {},
) {
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
            {...props}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

async function fillValidCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('客户'))
  await user.click(await screen.findByText('杭州同行'))

  const adultCount = screen.getByLabelText('成人人数')
  await user.clear(adultCount)
  await user.type(adultCount, '1')

  const adultPrice = screen.getByLabelText('成人团款单价（元）')
  await user.clear(adultPrice)
  await user.type(adultPrice, '1000')

  const deposit = screen.getByLabelText('定金（元）')
  await user.clear(deposit)
  await user.type(deposit, '0')

  const balance = screen.getByLabelText('尾款（元）')
  await user.clear(balance)
  await user.type(balance, '1000')
}

function setAdjustmentAmount(editor: HTMLElement, yuan: string) {
  const amount = within(editor).getByPlaceholderText('金额')
  fireEvent.focus(amount)
  fireEvent.change(amount, { target: { value: yuan } })
  fireEvent.blur(amount)
}

describe('SourceOrderDrawer fare adjustments', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes fare adjustments as a dedicated section with one-line columns', () => {
    renderDrawer()
    expect(screen.getByRole('heading', { name: '团款调整' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '基础信息' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '团款优惠' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /添加调整项/ })).toBeTruthy()

    const fareSection = document.getElementById('so-section-fare')
    expect(fareSection).toBeTruthy()
    expect(within(fareSection!).getByText('调整项目')).toBeTruthy()
    expect(within(fareSection!).getByText('调整说明')).toBeTruthy()
    expect(within(fareSection!).getByText('金额')).toBeTruthy()
    expect(within(fareSection!).getByText('操作')).toBeTruthy()
  })

  it('列序为金额在调整说明左侧', () => {
    renderDrawer()
    const fareSection = document.getElementById('so-section-fare')
    expect(fareSection).toBeTruthy()
    const headers = within(fareSection!)
      .getAllByRole('columnheader')
      .map((el) => el.textContent?.trim())
    const amountIdx = headers.indexOf('金额')
    const noteIdx = headers.indexOf('调整说明')
    expect(amountIdx).toBeGreaterThanOrEqual(0)
    expect(noteIdx).toBeGreaterThanOrEqual(0)
    expect(amountIdx).toBeLessThan(noteIdx)
  })

  it('adds a draft row with inline save/cancel and does not commit until save', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: /添加调整项/ }))

    const editor = screen.getByTestId('fare-adjustment-row-editor')
    expect(within(editor).getByRole('button', { name: '保存调整项' })).toBeTruthy()
    expect(within(editor).getByRole('button', { name: '取消调整项' })).toBeTruthy()
    expect(screen.queryByLabelText('编辑调整项')).toBeNull()

    setAdjustmentAmount(editor, '100')
    fireEvent.click(within(editor).getByRole('button', { name: '保存调整项' }))

    expect(screen.queryByTestId('fare-adjustment-row-editor')).toBeNull()
    expect(screen.getByLabelText('编辑调整项')).toBeTruthy()
    expect(screen.getByLabelText('删除调整项')).toBeTruthy()
    expect(screen.getByText('¥100.00')).toBeTruthy()
  }, 15_000)

  it('keeps direction controls only while a row is being edited', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: /添加调整项/ }))
    const editor = screen.getByTestId('fare-adjustment-row-editor')
    setAdjustmentAmount(editor, '50')
    fireEvent.click(within(editor).getByRole('button', { name: '保存调整项' }))

    expect(screen.queryByTestId('fare-adjustment-row-editor')).toBeNull()

    fireEvent.click(screen.getByLabelText('编辑调整项'))
    const editing = screen.getByTestId('fare-adjustment-row-editor')
    expect(within(editing).getAllByRole('combobox').length).toBeGreaterThanOrEqual(1)
  }, 15_000)

  it('blocks source-order save while an unsaved fare adjustment draft exists', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderDrawer({ onSubmit })

    await fillValidCreateForm(user)
    fireEvent.click(screen.getByRole('button', { name: /添加调整项/ }))
    fireEvent.click(screen.getByRole('button', { name: /保\s*存$/ }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText(/请先保存或取消当前调整行/)).toBeTruthy()
  }, 20_000)
})
