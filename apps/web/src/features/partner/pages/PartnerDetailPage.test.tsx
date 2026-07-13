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
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/services/partner.service', () => ({
  getPartner: vi.fn(),
  updatePartner: vi.fn(),
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
    expect(screen.getByRole('link', { name: /返回合作伙伴列表/ })).toHaveAttribute('href', '/partner')

    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(await screen.findByText('编辑合作伙伴')).toBeInTheDocument()
    expect(screen.getByLabelText('合作伙伴名称')).toHaveValue('华东国旅')
  })

  it('shows coming soon panels on placeholder tabs', async () => {
    const user = userEvent.setup()
    renderDetailPage()

    await screen.findByRole('heading', { level: 4, name: '华东国旅' })

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
