import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

function renderDrawer(
  props: Partial<React.ComponentProps<typeof SourceOrderDrawer>> & {
    onSubmit: React.ComponentProps<typeof SourceOrderDrawer>['onSubmit']
  },
) {
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
          {...props}
        />
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
}

describe('SourceOrderDrawer save and generate', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows 保存并生成应收 when canSaveAndGenerate is enabled on create', () => {
    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit: vi.fn(),
    })

    expect(screen.getByRole('button', { name: '保存并生成应收' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /保\s*存$/ })).toBeTruthy()
  })

  it('hides 保存并生成应收 when canSaveAndGenerate is false', () => {
    renderDrawer({
      canSaveAndGenerate: false,
      onSubmit: vi.fn(),
    })

    expect(screen.queryByRole('button', { name: '保存并生成应收' })).toBeNull()
  })

  it('submits with generateReceivable when 保存并生成应收 is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit,
    })

    await fillValidCreateForm(user)
    await user.click(screen.getByRole('button', { name: '保存并生成应收' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerId: 'partner-1',
          adultGuestCount: 1,
        }),
        null,
        { generateReceivable: true },
      )
    })
  })

  it('submits without generateReceivable when 保存 is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit,
    })

    await fillValidCreateForm(user)
    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ partnerId: 'partner-1' }),
        null,
        { generateReceivable: false },
      )
    })
  })
})
