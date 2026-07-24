import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceDrawer } from './ResourceDrawer'

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({ items: [], total: 0 })),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn(async () => ({
    items: [{ id: 'supplier-1', name: '喀纳斯车队', categories: ['transport'] }],
    total: 1,
  })),
  getSupplier: vi.fn(),
}))

function renderDrawer(
  props: Partial<React.ComponentProps<typeof ResourceDrawer>> & {
    onSubmit: React.ComponentProps<typeof ResourceDrawer>['onSubmit']
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <ResourceDrawer
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
  await user.click(await screen.findByLabelText('供应商'))
  await user.click(await screen.findByText('喀纳斯车队'))
  await user.type(screen.getByLabelText('资源名称'), '天山天池用车')
  const amount = screen.getByLabelText('资源金额（元）')
  await user.clear(amount)
  await user.type(amount, '3000')
}

describe('ResourceDrawer save and generate', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows 保存并生成应付 when canSaveAndGenerate is enabled', () => {
    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit: vi.fn(),
    })

    expect(screen.getByRole('button', { name: '保存并生成应付' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /保\s*存$/ })).toBeTruthy()
  })

  it('hides 保存并生成应付 when canSaveAndGenerate is false', () => {
    renderDrawer({
      canSaveAndGenerate: false,
      onSubmit: vi.fn(),
    })

    expect(screen.queryByRole('button', { name: '保存并生成应付' })).toBeNull()
  })

  it('disables 保存并生成应付 while saveAndGenerateLoading', () => {
    renderDrawer({
      canSaveAndGenerate: true,
      saveAndGenerateLoading: true,
      onSubmit: vi.fn(),
    })

    expect(screen.getByRole('button', { name: /保存并生成应付/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /保\s*存$/ })).toBeDisabled()
  })

  it('disables 保存并生成应付 while loading', () => {
    renderDrawer({
      canSaveAndGenerate: true,
      loading: true,
      onSubmit: vi.fn(),
    })

    expect(screen.getByRole('button', { name: /保存并生成应付/ })).toBeDisabled()
  })

  it('submits with generatePayable when 保存并生成应付 is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit,
    })

    await fillValidCreateForm(user)
    await user.click(screen.getByRole('button', { name: '保存并生成应付' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '天山天池用车',
          amountCents: 300000,
        }),
        { generatePayable: true },
      )
    })
  })

  it('submits without generatePayable when 保存 is clicked', async () => {
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
        expect.objectContaining({ title: '天山天池用车' }),
        { generatePayable: false },
      )
    })
  })

  it('does not keep saveAndGenerate intent after validation failure', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderDrawer({
      canSaveAndGenerate: true,
      onSubmit,
    })

    await user.click(screen.getByRole('button', { name: '保存并生成应付' }))
    expect(onSubmit).not.toHaveBeenCalled()
    await screen.findByText('请选择供应商')

    await fillValidCreateForm(user)
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: '天山天池用车' }),
        { generatePayable: false },
      )
    })
  })
})
