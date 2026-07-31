import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider, Form } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryProfileStatus, ResourceKind } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { createSupplier } from '@/services/supplier.service'
import { SupplierQuickCreateSelect } from './SupplierQuickCreateSelect'

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn(),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
}))

function Harness() {
  const [search, setSearch] = useState('')
  return (
    <Form>
      <Form.Item name="driverSupplierId" label="司机">
        <SupplierQuickCreateSelect
          category={ResourceKind.TRANSPORT}
          suppliers={[]}
          searchValue={search}
          onSearch={setSearch}
          placeholder="选择含「用车」类别的供应商"
          emptyHint="暂无匹配"
        />
      </Form.Item>
    </Form>
  )
}

function renderSelect() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <App>
          <Harness />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SupplierQuickCreateSelect', () => {
  beforeEach(() => {
    useAuthStore.setState({
      actionKeys: ['supplier:write'],
      menuKeys: [],
      user: null,
      sessionStatus: 'anonymous',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useAuthStore.setState({ actionKeys: [] })
  })

  it('creates supplier from typed search for crew category', async () => {
    const user = userEvent.setup()
    vi.mocked(createSupplier).mockResolvedValue({
      id: 'supplier-new',
      name: '新司机车队',
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

    renderSelect()

    await user.click(await screen.findByLabelText('司机'))
    await user.type(screen.getByRole('combobox', { name: '司机' }), '新司机车队')
    await user.click(await screen.findByText('创建“新司机车队”'))

    await waitFor(() => {
      expect(createSupplier).toHaveBeenCalledWith(
        { name: '新司机车队', categories: [ResourceKind.TRANSPORT] },
        { silentError: true },
      )
    })
  })

  it('hides create without supplier:write', async () => {
    useAuthStore.setState({ actionKeys: ['departure:write'] })
    const user = userEvent.setup()
    renderSelect()

    await user.click(await screen.findByLabelText('司机'))
    await user.type(screen.getByRole('combobox', { name: '司机' }), '新司机车队')

    await waitFor(() => {
      expect(screen.queryByText('创建“新司机车队”')).toBeNull()
    })
  })
})
