import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider, Form } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryProfileStatus, PartnerKind, PartnerType } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import { createPartner } from '@/services/partner.service'
import { PartnerQuickCreateSelect } from './PartnerQuickCreateSelect'

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(),
  getPartner: vi.fn(),
  createPartner: vi.fn(),
}))

function Harness() {
  const [search, setSearch] = useState('')
  return (
    <Form>
      <Form.Item name="partnerId" label="客户">
        <PartnerQuickCreateSelect
          partners={[]}
          searchValue={search}
          onSearch={setSearch}
          placeholder="选择合作伙伴"
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

describe('PartnerQuickCreateSelect', () => {
  beforeEach(() => {
    useAuthStore.setState({
      actionKeys: ['partner:write'],
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

  it('creates partner as 组团社 + 客户方', async () => {
    const user = userEvent.setup()
    vi.mocked(createPartner).mockResolvedValue({
      id: 'p-new',
      name: '绿野旅行社',
      partnerKind: PartnerKind.GROUP_AGENT,
      partnerType: PartnerType.GROUP_AGENCY,
      status: DirectoryProfileStatus.ACTIVE,
      contactName: null,
      contactRole: null,
      contactPhone: null,
      settlementMethod: null,
      paymentTermRule: null,
      settlementNotes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    renderSelect()
    await user.click(await screen.findByLabelText('客户'))
    await user.type(screen.getByRole('combobox', { name: '客户' }), '绿野旅行社')
    await user.click(await screen.findByText('创建“绿野旅行社”'))

    await waitFor(() => {
      expect(createPartner).toHaveBeenCalledWith(
        {
          name: '绿野旅行社',
          partnerType: PartnerType.GROUP_AGENCY,
          partnerKind: PartnerKind.GROUP_AGENT,
        },
        { silentError: true },
      )
    })
  })

  it('hides create without partner:write', async () => {
    useAuthStore.setState({ actionKeys: ['departure:write'] })
    const user = userEvent.setup()
    renderSelect()
    await user.click(await screen.findByLabelText('客户'))
    await user.type(screen.getByRole('combobox', { name: '客户' }), '绿野旅行社')
    await waitFor(() => {
      expect(screen.queryByText('创建“绿野旅行社”')).toBeNull()
    })
  })
})
