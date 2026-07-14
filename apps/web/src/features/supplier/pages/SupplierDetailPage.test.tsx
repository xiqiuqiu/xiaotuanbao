import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceKind, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { SupplierDetailPage } from './SupplierDetailPage'

const mockSupplier: SupplierSummary = {
  id: 'sup-1',
  name: '西湖国宾馆',
  categories: [ResourceKind.HOTEL],
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '张经理',
  contactPhone: '13800138000',
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ supplierId: 'sup-1' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/supplier.service', () => ({
  getSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}))

import { getSupplier } from '@/services/supplier.service'

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SupplierDetailPage />
    </QueryClientProvider>,
  )
}

describe('SupplierDetailPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.mocked(getSupplier).mockResolvedValue(mockSupplier)
  })

  it('shows supplier name and opens shared edit drawer from header', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    expect(await screen.findByRole('heading', { level: 4, name: '西湖国宾馆' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回供应商列表/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(await screen.findByText('编辑供应商')).toBeInTheDocument()
    expect(screen.getByLabelText('供应商名称')).toHaveValue('西湖国宾馆')
  })

  it('shows coming soon panels on placeholder tabs', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '西湖国宾馆' })

    await user.click(screen.getByRole('tab', { name: '往来账款' }))
    await waitFor(() => {
      expect(screen.getByText('功能建设中，暂不可用')).toBeInTheDocument()
    })

    await user.click(screen.getAllByRole('tab', { name: '合作团单' })[0]!)
    await waitFor(() => {
      expect(screen.getAllByText('功能建设中，暂不可用').length).toBeGreaterThanOrEqual(1)
    })
  })
})
