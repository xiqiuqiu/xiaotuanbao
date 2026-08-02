import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CounterpartyType, ResourceKind, SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { SegmentResourceSummary } from '@/types/api'
import { ResourceDrawer } from './ResourceDrawer'

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn(async () => ({
    items: [{ id: 'supplier-travel', name: '绿野旅行社', categories: ['outsource'] }],
    total: 1,
  })),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
}))

const historicalPartnerResource: SegmentResourceSummary = {
  id: 'res-historical',
  segmentId: 'seg-1',
  departureId: 'dep-1',
  resourceKind: ResourceKind.OUTSOURCE,
  counterpartyType: CounterpartyType.PARTNER,
  partnerId: 'partner-1',
  partnerName: '喀纳斯同行',
  supplierId: null,
  supplierName: null,
  counterpartyName: '喀纳斯同行',
  title: '阿勒泰拼出',
  amountCents: 500000,
  notes: null,
  pendingCheck: false,
  hasPaymentSchedule: false,
  payableStatus: SegmentPayableStatus.NOT_GENERATED,
  hasSourceAmountMismatch: false,
  amountFieldsLocked: false,
  paymentScheduleId: null,
  financeTouched: false,
  unsettledAmountCents: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

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
        <App>
          <ResourceDrawer
            open
            editing={historicalPartnerResource}
            readOnly={false}
            loading={false}
            onClose={vi.fn()}
            {...props}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ResourceDrawer historical partner outsource', () => {
  afterEach(() => {
    cleanup()
  })

  it('allows saving title/amount without selecting a supplier', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderDrawer({ onSubmit })

    expect(screen.getByText('历史承接方资源')).toBeTruthy()
    expect(screen.getByText(/喀纳斯同行/)).toBeTruthy()

    const title = screen.getByLabelText('资源名称')
    await user.clear(title)
    await user.type(title, '阿勒泰拼出（修订）')
    await user.click(screen.getByRole('button', { name: /保\s*存$/ }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceKind: ResourceKind.OUTSOURCE,
          title: '阿勒泰拼出（修订）',
          amountCents: 500000,
        }),
        { generatePayable: false },
      )
    })
    expect(onSubmit.mock.calls[0]?.[0]?.supplierId).toBeUndefined()
  })
})
