import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Modal } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { SourceOrdersTab } from './SourceOrdersTab'

const navigate = vi.fn()
const listSourceOrders = vi.fn()
const updateSourceOrder = vi.fn()
const getGuestCollectionChangeImpact = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({
    items: [{ id: 'partner-1', name: '杭州同行' }],
    total: 1,
  })),
}))

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: (...args: unknown[]) => listSourceOrders(...args),
  createSourceOrder: vi.fn(),
  updateSourceOrder: (...args: unknown[]) => updateSourceOrder(...args),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: (...args: unknown[]) =>
    getGuestCollectionChangeImpact(...args),
}))

vi.mock('./SourceOrderDrawer', () => ({
  SourceOrderDrawer: ({
    open,
    editing,
    onSubmit,
    onClose,
  }: {
    open: boolean
    editing: SourceOrderSummary | null
    onSubmit: (payload: Record<string, unknown>) => void
    onClose: () => void
  }) =>
    open && editing ? (
      <div>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              partnerId: editing.partnerId,
              adultGuestCount: editing.adultGuestCount,
              childGuestCount: editing.childGuestCount,
              adultUnitPriceCents: 30000,
              childUnitPriceCents: editing.childUnitPriceCents,
              discountType: editing.discountType,
              discountCents: editing.discountCents,
              discountNotes: editing.discountNotes,
              collectionMode: editing.collectionMode,
              partnerCollectedCents: editing.partnerCollectedCents,
              settlementNotes: editing.settlementNotes,
              notes: editing.notes,
            })
          }
        >
          模拟保存改价
        </button>
        <button type="button" onClick={onClose}>
          关闭抽屉
        </button>
      </div>
    ) : null,
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  status: 'editing',
} as DepartureDetail

function baseOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '杭州同行',
    displayName: '杭州同行',
    guestCount: 1,
    adultGuestCount: 1,
    childGuestCount: 0,
    adultUnitPriceCents: 50000,
    childUnitPriceCents: 0,
    grossReceivableCents: 50000,
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 50000,
    collectionMode: 'guest_only',
    partnerCollectedCents: 0,
    guestCollectCents: 50000,
    settlementNotes: null,
    notes: null,
    receivableStatus: 'not_generated',
    hasPaymentSchedule: false,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <SourceOrdersTab departure={departure} readOnly={false} canEdit />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrdersTab 金额路径变更软警示', () => {
  afterEach(() => {
    Modal.destroyAll()
    cleanup()
    navigate.mockReset()
    listSourceOrders.mockReset()
    updateSourceOrder.mockReset()
    getGuestCollectionChangeImpact.mockReset()
  })

  it('confirms before update when path amounts change and impact > 0', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [baseOrder()],
      summary: {
        orderCount: 1,
        totalGuests: 1,
        partnerCount: 1,
        totalDiscountCents: 0,
        totalNetReceivableCents: 50000,
        totalGuestCollectCents: 50000,
      },
      total: 1,
    })
    getGuestCollectionChangeImpact.mockResolvedValue({ affectedTransactionCount: 2 })
    updateSourceOrder.mockResolvedValue(
      baseOrder({ adultUnitPriceCents: 30000, guestCollectCents: 30000 }),
    )

    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })

    try {
      renderTab()
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      await user.click(await screen.findByRole('button', { name: '模拟保存改价' }))

      await waitFor(() =>
        expect(getGuestCollectionChangeImpact).toHaveBeenCalledWith(
          'order-1',
          expect.any(AbortSignal),
        ),
      )
      expect(updateSourceOrder).not.toHaveBeenCalled()
      expect(confirmConfig?.title).toBe('关联流水金额可能受影响')

      const { unmount: unmountConfirm } = render(
        <ConfigProvider>{confirmConfig?.content}</ConfigProvider>,
      )
      expect(screen.getByText(/本单有 2 笔未核销游客代收流水/)).toBeInTheDocument()
      expect(screen.getByText(/我方代收 ¥500\.00 → ¥300\.00/)).toBeInTheDocument()
      unmountConfirm()

      await Promise.resolve(confirmConfig?.onOk?.())
      await waitFor(() => expect(updateSourceOrder).toHaveBeenCalledTimes(1))
    } finally {
      confirmSpy.mockRestore()
      Modal.destroyAll()
    }
  })

  it('does not call update when soft warning is shown and user does not confirm', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [baseOrder()],
      summary: {
        orderCount: 1,
        totalGuests: 1,
        partnerCount: 1,
        totalDiscountCents: 0,
        totalNetReceivableCents: 50000,
        totalGuestCollectCents: 50000,
      },
      total: 1,
    })
    getGuestCollectionChangeImpact.mockResolvedValue({ affectedTransactionCount: 1 })

    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })

    try {
      renderTab()
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      await user.click(await screen.findByRole('button', { name: '模拟保存改价' }))

      await waitFor(() => expect(confirmConfig).toBeDefined())
      expect(updateSourceOrder).not.toHaveBeenCalled()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('discards stale impact when drawer closes before response', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [baseOrder()],
      summary: {
        orderCount: 1,
        totalGuests: 1,
        partnerCount: 1,
        totalDiscountCents: 0,
        totalNetReceivableCents: 50000,
        totalGuestCollectCents: 50000,
      },
      total: 1,
    })

    let resolveImpact: (value: { affectedTransactionCount: number }) => void
    const impactPromise = new Promise<{ affectedTransactionCount: number }>((resolve) => {
      resolveImpact = resolve
    })
    getGuestCollectionChangeImpact.mockReturnValue(impactPromise)

    const confirmSpy = vi.spyOn(Modal, 'confirm')

    try {
      renderTab()
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      await user.click(await screen.findByRole('button', { name: '模拟保存改价' }))
      await user.click(await screen.findByRole('button', { name: '关闭抽屉' }))

      resolveImpact!({ affectedTransactionCount: 2 })

      await waitFor(() =>
        expect(getGuestCollectionChangeImpact).toHaveBeenCalledWith(
          'order-1',
          expect.any(AbortSignal),
        ),
      )
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(updateSourceOrder).not.toHaveBeenCalled()
    } finally {
      confirmSpy.mockRestore()
    }
  })
})
