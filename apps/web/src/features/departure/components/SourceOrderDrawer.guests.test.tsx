import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  await user.type(adultCount, '2')

  const adultPrice = screen.getByLabelText('成人团款单价（元）')
  await user.clear(adultPrice)
  await user.type(adultPrice, '1000')

  const deposit = screen.getByLabelText('定金（元）')
  await user.clear(deposit)
  await user.type(deposit, '0')

  const balance = screen.getByLabelText('尾款（元）')
  await user.clear(balance)
  await user.type(balance, '2000')
}

function fillGuestName(editor: HTMLElement, name: string) {
  const input = within(editor).getByPlaceholderText('姓名')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: name } })
  fireEvent.blur(input)
}

describe('SourceOrderDrawer guests', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes collapsible guest roster with recorded vs planned badge', () => {
    renderDrawer()

    const guestsHeading = screen.getByRole('heading', { name: '客人名单' })
    expect(guestsHeading).toBeTruthy()
    expect(screen.getByText(/已录/)).toBeTruthy()
    expect(screen.getByText(/计划/)).toBeTruthy()
    expect(screen.getByLabelText('折叠客人名单')).toBeTruthy()
    expect(screen.getByRole('button', { name: /添加客人/ })).toBeTruthy()

    const guestsSection = document.getElementById('so-section-guests')
    expect(guestsSection).toBeTruthy()
    expect(within(guestsSection!).getByText('姓名')).toBeTruthy()
    expect(within(guestsSection!).getByText('手机')).toBeTruthy()
    expect(within(guestsSection!).getByText('性别')).toBeTruthy()
    expect(within(guestsSection!).getByText('备注')).toBeTruthy()
  })

  it('adds a guest draft with inline save/cancel and commits only after save', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: /添加客人/ }))

    const editor = screen.getByTestId('guest-row-editor')
    expect(within(editor).getByRole('button', { name: '保存客人' })).toBeTruthy()
    expect(within(editor).getByRole('button', { name: '取消客人' })).toBeTruthy()

    fillGuestName(editor, '张三')
    fireEvent.click(within(editor).getByRole('button', { name: '保存客人' }))

    expect(screen.queryByTestId('guest-row-editor')).toBeNull()
    expect(screen.getByText('张三')).toBeTruthy()
    expect(screen.getByLabelText('编辑客人')).toBeTruthy()
    expect(screen.getByLabelText('删除客人')).toBeTruthy()
  }, 15_000)

  it('blocks source-order save while an unsaved guest draft exists', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderDrawer({ onSubmit })

    await fillValidCreateForm(user)
    fireEvent.click(screen.getByRole('button', { name: /添加客人/ }))
    fireEvent.click(screen.getByRole('button', { name: /保\s*存$/ }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText(/请先保存或取消当前名单行/)).toBeTruthy()
  }, 20_000)

  it('submits committed guests with the source order and does not rewrite headcount from roster', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderDrawer({ onSubmit })

    await fillValidCreateForm(user)

    fireEvent.click(screen.getByRole('button', { name: /添加客人/ }))
    fillGuestName(screen.getByTestId('guest-row-editor'), '李四')
    fireEvent.click(within(screen.getByTestId('guest-row-editor')).getByRole('button', { name: '保存客人' }))

    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
    const [payload, , options] = onSubmit.mock.calls[0]
    expect(payload.adultGuestCount).toBe(2)
    expect(payload.childGuestCount).toBe(0)
    expect(options?.guests?.next).toEqual([
      expect.objectContaining({ name: '李四' }),
    ])
    expect(options?.guests?.next).toHaveLength(1)
  }, 20_000)

  it('collapses guest table to a name summary without removing committed rows', () => {
    renderDrawer()

    fireEvent.click(screen.getByRole('button', { name: /添加客人/ }))
    fillGuestName(screen.getByTestId('guest-row-editor'), '王五')
    fireEvent.click(within(screen.getByTestId('guest-row-editor')).getByRole('button', { name: '保存客人' }))

    fireEvent.click(screen.getByLabelText('折叠客人名单'))
    expect(screen.getByLabelText('展开客人名单')).toBeTruthy()
    expect(screen.getAllByText('王五').length).toBeGreaterThanOrEqual(1)
    // Hidden (display:none) but still mounted — not exposed to default role queries.
    expect(screen.queryByRole('button', { name: /添加客人/ })).toBeNull()
    expect(screen.getByRole('button', { name: /添加客人/, hidden: true })).toBeTruthy()

    fireEvent.click(screen.getByLabelText('展开客人名单'))
    expect(screen.getByRole('button', { name: /添加客人/ })).toBeTruthy()
    expect(screen.getAllByText('王五').length).toBeGreaterThanOrEqual(1)
  }, 15_000)

  it('keeps unsaved guest draft hard-block after collapsing the roster', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderDrawer({ onSubmit })

    await fillValidCreateForm(user)
    fireEvent.click(screen.getByRole('button', { name: /添加客人/ }))
    expect(screen.getByTestId('guest-row-editor')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('折叠客人名单'))
    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText(/请先保存或取消当前名单行/)).toBeTruthy()
  }, 20_000)
})
