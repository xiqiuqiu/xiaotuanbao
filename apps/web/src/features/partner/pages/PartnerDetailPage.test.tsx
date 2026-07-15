import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
} from '@xiaotuanbao/shared'
import type { PartnerSummary } from '@/types/api'
import { PartnerDetailPage } from './PartnerDetailPage'

const mockPartner: PartnerSummary = {
  id: 'partner-1',
  name: '华东国旅',
  partnerKind: PartnerKind.GROUP_AGENT,
  partnerType: PartnerType.GROUP_AGENCY,
  status: DirectoryProfileStatus.ACTIVE,
  contactName: '王经理',
  contactRole: null,
  contactPhone: '13800138000',
  settlementMethod: null,
  paymentTermRule: null,
  settlementNotes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ partnerId: 'partner-1' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/partner.service', () => ({
  getPartner: vi.fn(),
  updatePartner: vi.fn(),
}))

const listPartnerReceivables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))
const listPartnerPayables = vi.fn(async () => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
}))

vi.mock('@/services/finance.service', () => ({
  listPartnerReceivables: (...args: unknown[]) => listPartnerReceivables(...(args as [])),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...(args as [])),
  listReceivables: vi.fn(),
  listPayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
  listFinancePartnerOptions: vi.fn(async () => []),
  listFinanceSupplierOptions: vi.fn(async () => []),
  listFinanceSourceOrderOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

import { getPartner } from '@/services/partner.service'

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PartnerDetailPage />
    </QueryClientProvider>,
  )
}

describe('PartnerDetailPage', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.mocked(getPartner).mockResolvedValue(mockPartner)
  })

  it('shows partner name and opens shared edit drawer from header', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    expect(await screen.findByRole('heading', { level: 4, name: '华东国旅' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回合作伙伴列表/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(await screen.findByText('编辑合作伙伴')).toBeInTheDocument()
    expect(screen.getByLabelText('合作伙伴名称')).toHaveValue('华东国旅')
  })

  it('renders receivable and payable ledger sections on the accounts tab', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })

    await user.click(screen.getByRole('tab', { name: '往来账款' }))
    expect(
      await screen.findByRole('heading', { level: 5, name: '应收（我收他）' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 5, name: '应付（我付他）' }),
    ).toBeInTheDocument()

    // 双子区各自向 Partner 维度端点精确取数
    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalledWith(
        'partner-1',
        expect.anything(),
        expect.anything(),
      )
      expect(listPartnerPayables).toHaveBeenCalledWith(
        'partner-1',
        expect.anything(),
        expect.anything(),
      )
    })
  })

  it('keeps the coming soon panel on the groups tab', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })

    await user.click(screen.getByRole('tab', { name: '合作团单' }))
    await waitFor(() => {
      expect(screen.getByText('功能建设中，暂不可用')).toBeInTheDocument()
    })
  })
})
