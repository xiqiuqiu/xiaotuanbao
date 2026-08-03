import type { PropsWithChildren } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { App, ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentChannel } from '@xiaotuanbao/shared'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { SourceOrdersTab } from '@/features/departure/components/SourceOrdersTab'
import { EMPTY_SOURCE_ORDER_FILTERS } from '@/features/departure/utils/source-order-filter-state'
import {
  confirmCollection,
  createVerification,
} from '@/services/finance.service'
import { usePaymentScheduleMutations } from './usePaymentScheduleMutations'

/**
 * Feedback loop for: after receivable verify/confirm on 应收管理,
 * switching back to 客源管理 must show fresh receivableStatus (not stale cache).
 */

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

vi.mock('@/services/finance.service', () => ({
  adjustScheduleAmount: vi.fn(),
  cancelSchedule: vi.fn(),
  confirmCollection: vi.fn(),
  confirmPayment: vi.fn(),
  createVerification: vi.fn(),
  reopenSchedule: vi.fn(),
  updatePayable: vi.fn(),
  updateReceivable: vi.fn(),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({ items: [], total: 0 })),
}))

const listSourceOrders = vi.fn()

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: (...args: unknown[]) => listSourceOrders(...args),
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(async () => ({ affectedTransactionCount: 0 })),
}))

const departure = {
  id: 'dep-1',
  departureNo: 'XTB2026080001',
  name: '反馈环发团',
  status: 'editing',
} as DepartureDetail

function staleOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'dep-1',
    partnerId: 'partner-1',
    partnerName: '下地',
    displayName: '下地',
    guestCount: 4,
    adultGuestCount: 4,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    grossReceivableCents: 400000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 400000,
    collectionMode: 'mixed',
    depositCents: 0,
    balanceCents: 400000,
    partnerCollectedCents: 300000,
    guestCollectCents: 100000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'partial',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    hasIncompleteReceivablePaths: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    rebateScheduleNo: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function listPayload(order: SourceOrderSummary) {
  return {
    items: [order],
    summary: {
      orderCount: 1,
      totalGuests: 4,
      partnerCount: 1,
      totalGrossReceivableCents: 400000,
      totalFareAdjustmentNetCents: 0,
      totalDiscountCents: 0,
      totalNetReceivableCents: 400000,
      totalGuestCollectCents: 100000,
    },
    total: 1,
  }
}

function seedStaleSourceOrders(queryClient: QueryClient) {
  queryClient.setQueryData(
    ['source-orders', 'dep-1', EMPTY_SOURCE_ORDER_FILTERS],
    listPayload(staleOrder({ receivableStatus: 'partial' })),
  )
}

function renderMutations(queryClient: QueryClient) {
  const form = { resetFields: vi.fn() } as never
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <App>{children}</App>
      </QueryClientProvider>
    )
  }
  return renderHook(
    () =>
      usePaymentScheduleMutations({
        queryClient,
        isReceivable: true,
        listQueryKey: 'departure-receivables',
        partnerListQueryKey: 'partner-receivables',
        supplierListQueryKey: 'supplier-payables',
        activeSchedule: { id: 'schedule-1', departureId: 'dep-1' } as never,
        confirmForm: form,
        verifyForm: form,
        cancelForm: form,
        reopenForm: form,
        adjustForm: form,
        editForm: form,
        onConfirmSuccess: vi.fn(),
        onVerifySuccess: vi.fn(),
        onCancelSuccess: vi.fn(),
        onReopenSuccess: vi.fn(),
        onAdjustSuccess: vi.fn(),
        onEditSuccess: vi.fn(),
      }),
    { wrapper: Wrapper },
  ).result
}

function renderSourceOrdersTab(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <App>
          <SourceOrdersTab departure={departure} readOnly={false} canEdit />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('应收核销后客源管理应收状态刷新', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createVerification).mockResolvedValue({ generatedRebatePayable: null } as never)
    vi.mocked(confirmCollection).mockResolvedValue({ generatedRebatePayable: null } as never)
    listSourceOrders.mockResolvedValue(listPayload(staleOrder({ receivableStatus: 'collected' })))
  })

  afterEach(() => {
    cleanup()
  })

  it('核销完成后切回客源管理，应收状态应显示最新「已收齐」而非缓存的「部分收款」', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 30_000 },
        mutations: { retry: false },
      },
    })
    seedStaleSourceOrders(queryClient)
    const mutations = renderMutations(queryClient)

    await act(async () => {
      await mutations.current.verifyCreateMutation.mutateAsync({
        direction: 'receivable',
        verificationDate: '2026-08-03',
        transactionId: 'tx-1',
        paymentScheduleId: 'schedule-1',
        amountYuan: 100,
        affectedDepartureIds: ['dep-1'],
      })
    })

    // Simulate destroyOnHidden tab switch back to 客源管理
    renderSourceOrdersTab(queryClient)

    await waitFor(() => {
      expect(screen.getByText('已收齐')).toBeTruthy()
    })
    expect(screen.queryByText('部分收款')).toBeNull()
    expect(listSourceOrders).toHaveBeenCalled()
  })

  it('确认收款并核销后切回客源管理，应收状态应显示最新「已收齐」而非缓存的「部分收款」', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 30_000 },
        mutations: { retry: false },
      },
    })
    seedStaleSourceOrders(queryClient)
    const mutations = renderMutations(queryClient)

    await act(async () => {
      await mutations.current.confirmMutation.mutateAsync({
        amountYuan: 100,
        paymentChannel: PaymentChannel.CASH,
        transactionDate: dayjs('2026-08-03'),
      })
    })

    renderSourceOrdersTab(queryClient)

    await waitFor(() => {
      expect(screen.getByText('已收齐')).toBeTruthy()
    })
    expect(screen.queryByText('部分收款')).toBeNull()
    expect(listSourceOrders).toHaveBeenCalled()
  })

  it('负向对照：未核销时在 staleTime 内切回客源管理，仍展示缓存的「部分收款」', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 30_000 },
        mutations: { retry: false },
      },
    })
    seedStaleSourceOrders(queryClient)

    renderSourceOrdersTab(queryClient)

    await waitFor(() => {
      expect(screen.getByText('部分收款')).toBeTruthy()
    })
    expect(screen.queryByText('已收齐')).toBeNull()
    expect(listSourceOrders).not.toHaveBeenCalled()
  })
})
