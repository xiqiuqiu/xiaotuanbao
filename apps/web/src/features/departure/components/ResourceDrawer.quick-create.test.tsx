import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { ApiError } from '@/lib/request'
import { createSupplier, listSuppliers } from '@/services/supplier.service'
import { ResourceDrawer } from './ResourceDrawer'

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn(async () => ({
    items: [{ id: 'supplier-1', name: '喀纳斯车队', categories: ['transport'], status: 'active' }],
    total: 1,
  })),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
}))

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <App>
          <ResourceDrawer
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

describe('ResourceDrawer supplier quick create', () => {
  beforeEach(() => {
    useAuthStore.setState({
      actionKeys: ['supplier:write'],
      menuKeys: [],
      user: null,
      sessionStatus: 'anonymous',
    })
    vi.mocked(listSuppliers).mockResolvedValue({
      items: [
        {
          id: 'supplier-1',
          name: '喀纳斯车队',
          categories: ['transport'],
          status: DirectoryProfileStatus.ACTIVE,
          contactName: null,
          contactPhone: null,
          settlementMethod: null,
          settlementCycle: null,
          settlementNotes: null,
          referenceQuoteNotes: null,
          invoiceAvailable: null,
          invoiceType: null,
          taxRate: null,
          accountName: null,
          bankName: null,
          bankAccount: null,
          businessNotes: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useAuthStore.setState({ actionKeys: [] })
  })

  it('shows 创建 option when searching a new name with supplier:write', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByLabelText('供应商'))
    await user.type(screen.getByRole('combobox', { name: '供应商' }), '新车队')

    expect(await screen.findByText('创建“新车队”')).toBeTruthy()
  })

  it('hides 创建 option without supplier:write', async () => {
    useAuthStore.setState({ actionKeys: ['departure:write'] })
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByLabelText('供应商'))
    await user.type(screen.getByRole('combobox', { name: '供应商' }), '新车队')

    await waitFor(() => {
      expect(screen.queryByText('创建“新车队”')).toBeNull()
    })
  })

  it('creates supplier and selects it', async () => {
    const user = userEvent.setup()
    vi.mocked(createSupplier).mockResolvedValue({
      id: 'supplier-new',
      name: '新车队',
      categories: [ResourceKind.TRANSPORT],
      status: DirectoryProfileStatus.ACTIVE,
      contactName: null,
      contactPhone: null,
      settlementMethod: null,
      settlementCycle: null,
      settlementNotes: null,
      referenceQuoteNotes: null,
      invoiceAvailable: null,
      invoiceType: null,
      taxRate: null,
      accountName: null,
      bankName: null,
      bankAccount: null,
      businessNotes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    renderDrawer()

    await user.click(await screen.findByLabelText('供应商'))
    await user.type(screen.getByRole('combobox', { name: '供应商' }), '新车队')
    await user.click(await screen.findByText('创建“新车队”'))

    await waitFor(() => {
      expect(createSupplier).toHaveBeenCalledWith(
        { name: '新车队', categories: [ResourceKind.TRANSPORT] },
        { silentError: true },
      )
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '供应商' }).closest('.ant-select')).toHaveTextContent(
        '新车队',
      )
    })
  })

  it('selects existing supplier when create hits name conflict', async () => {
    const user = userEvent.setup()
    vi.mocked(createSupplier).mockRejectedValue(new ApiError('供应商名称已存在', 409))
    vi.mocked(listSuppliers)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'supplier-1',
            name: '喀纳斯车队',
            categories: ['transport'],
            status: DirectoryProfileStatus.ACTIVE,
            contactName: null,
            contactPhone: null,
            settlementMethod: null,
            settlementCycle: null,
            settlementNotes: null,
            referenceQuoteNotes: null,
            invoiceAvailable: null,
            invoiceType: null,
            taxRate: null,
            accountName: null,
            bankName: null,
            bankAccount: null,
            businessNotes: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'supplier-dup',
            name: '同名车队',
            categories: ['transport'],
            status: DirectoryProfileStatus.ACTIVE,
            contactName: null,
            contactPhone: null,
            settlementMethod: null,
            settlementCycle: null,
            settlementNotes: null,
            referenceQuoteNotes: null,
            invoiceAvailable: null,
            invoiceType: null,
            taxRate: null,
            accountName: null,
            bankName: null,
            bankAccount: null,
            businessNotes: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      })

    renderDrawer()

    await user.click(await screen.findByLabelText('供应商'))
    await user.type(screen.getByRole('combobox', { name: '供应商' }), '同名车队')
    await user.click(await screen.findByText('创建“同名车队”'))

    await waitFor(() => {
      expect(createSupplier).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '供应商' }).closest('.ant-select')).toHaveTextContent(
        '同名车队',
      )
    })
  })
})
