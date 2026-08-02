import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, type ReactNode } from 'react'
import type { SourceOrderSummary } from '@/types/api'
import { formValuesToPayload, sourceOrderToFormValues } from '../utils/source-order-form'
import { useSourceOrderSubmit } from './useSourceOrdersTabMutations'

const getGuestCollectionChangeImpact = vi.fn()

vi.mock('@/services/source-order.service', () => ({
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: (...args: unknown[]) =>
    getGuestCollectionChangeImpact(...args),
}))

function staleListOrder(): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '福建土楼专线地接',
    displayName: '福建土楼专线地接',
    guestCount: 1,
    adultGuestCount: 1,
    childGuestCount: 0,
    adultUnitPriceCents: 700000,
    childUnitPriceCents: 0,
    // List row still shows pre-sync path amounts.
    grossReceivableCents: 700000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 700000,
    collectionMode: 'split',
    depositCents: 100000,
    balanceCents: 600000,
    partnerCollectedCents: 100000,
    guestCollectCents: 600000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'pending',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: true,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

/** Fresh GET detail after receivable sync (authoritative path amounts). */
function freshDetailOrder(): SourceOrderSummary {
  return {
    ...staleListOrder(),
    grossReceivableCents: 720000,
    netReceivableCents: 720000,
    depositCents: 100000,
    balanceCents: 620000,
    guestCollectCents: 620000,
    amountFieldsLocked: true,
  }
}

function renderHarness(ui: ReactNode) {
  return render(
    <ConfigProvider>
      <App>{ui}</App>
    </ConfigProvider>,
  )
}

describe('useSourceOrderSubmit path baseline after receivable sync', () => {
  afterEach(() => {
    cleanup()
    getGuestCollectionChangeImpact.mockReset()
  })

  it('does not call guest-collection impact for notes-only save when list row lags GET detail', async () => {
    const user = userEvent.setup()
    getGuestCollectionChangeImpact.mockResolvedValue({ affectedTransactionCount: 2 })
    const saveMutate = vi.fn()

    function Harness() {
      const impactAbortRef = useRef<AbortController | null>(null)
      const latestEditingOrderIdRef = useRef<string | undefined>('order-1')
      const listOrder = staleListOrder()
      const detailOrder = freshDetailOrder()
      const saveMutation = {
        mutate: saveMutate,
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveMutation']
      const saveAndGenerateMutation = {
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveAndGenerateMutation']

      const submit = useSourceOrderSubmit({
        editingOrder: listOrder,
        saveMutation,
        saveAndGenerateMutation,
        impactAbortRef,
        latestEditingOrderIdRef,
      })

      return (
        <button
          type="button"
          onClick={() => {
            const payload = {
              ...formValuesToPayload(sourceOrderToFormValues(detailOrder)),
              notes: '仅改备注',
            }
            // Baseline from GET detail that hydrated the form — not the stale list row.
            void submit(payload, {
              guestCollectCents: detailOrder.guestCollectCents,
              partnerCollectedCents: detailOrder.partnerCollectedCents,
              depositCents: detailOrder.depositCents,
              balanceCents: detailOrder.balanceCents,
            })
          }}
        >
          保存
        </button>
      )
    }

    renderHarness(<Harness />)

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1))
    expect(getGuestCollectionChangeImpact).not.toHaveBeenCalled()
    expect(screen.queryByText('关联流水金额可能受影响')).not.toBeInTheDocument()
  })

  it('still confirms when payload path amounts diverge from GET detail baseline', async () => {
    const user = userEvent.setup()
    getGuestCollectionChangeImpact.mockResolvedValue({ affectedTransactionCount: 2 })
    const saveMutate = vi.fn()

    function Harness() {
      const impactAbortRef = useRef<AbortController | null>(null)
      const latestEditingOrderIdRef = useRef<string | undefined>('order-1')
      const listOrder = staleListOrder()
      const detailOrder = freshDetailOrder()
      const saveMutation = {
        mutate: saveMutate,
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveMutation']
      const saveAndGenerateMutation = {
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveAndGenerateMutation']

      const submit = useSourceOrderSubmit({
        editingOrder: listOrder,
        saveMutation,
        saveAndGenerateMutation,
        impactAbortRef,
        latestEditingOrderIdRef,
      })

      return (
        <button
          type="button"
          onClick={() => {
            const payload = formValuesToPayload(sourceOrderToFormValues(detailOrder))
            void submit(
              {
                ...payload,
                // 新口径下改单价不改路径金额；改尾款才会触发代收路径变更软警示
                depositCents: 100000,
                balanceCents: 500000,
              },
              {
                guestCollectCents: detailOrder.guestCollectCents,
                partnerCollectedCents: detailOrder.partnerCollectedCents,
                depositCents: detailOrder.depositCents,
                balanceCents: detailOrder.balanceCents,
              },
            )
          }}
        >
          保存改价
        </button>
      )
    }

    renderHarness(<Harness />)

    await user.click(screen.getByRole('button', { name: '保存改价' }))

    await waitFor(() =>
      expect(getGuestCollectionChangeImpact).toHaveBeenCalledWith(
        'order-1',
        expect.any(AbortSignal),
      ),
    )
    expect(saveMutate).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('关联流水金额可能受影响').length).toBeGreaterThan(0)
  })

  it('confirms when guest_only reallocates deposit/balance with unchanged guestCollect total', async () => {
    const user = userEvent.setup()
    getGuestCollectionChangeImpact.mockResolvedValue({ affectedTransactionCount: 1 })
    const saveMutate = vi.fn()

    const guestOnlyOrder: SourceOrderSummary = {
      ...staleListOrder(),
      collectionMode: 'guest_only',
      depositCents: 400000,
      balanceCents: 600000,
      partnerCollectedCents: 0,
      guestCollectCents: 1000000,
      netReceivableCents: 1000000,
      grossReceivableCents: 1000000,
    }

    function Harness() {
      const impactAbortRef = useRef<AbortController | null>(null)
      const latestEditingOrderIdRef = useRef<string | undefined>('order-1')
      const saveMutation = {
        mutate: saveMutate,
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveMutation']
      const saveAndGenerateMutation = {
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
      } as unknown as Parameters<typeof useSourceOrderSubmit>[0]['saveAndGenerateMutation']

      const submit = useSourceOrderSubmit({
        editingOrder: guestOnlyOrder,
        saveMutation,
        saveAndGenerateMutation,
        impactAbortRef,
        latestEditingOrderIdRef,
      })

      return (
        <button
          type="button"
          onClick={() => {
            const payload = formValuesToPayload(sourceOrderToFormValues(guestOnlyOrder))
            void submit(
              {
                ...payload,
                depositCents: 300000,
                balanceCents: 700000,
              },
              {
                guestCollectCents: guestOnlyOrder.guestCollectCents,
                partnerCollectedCents: guestOnlyOrder.partnerCollectedCents,
                depositCents: guestOnlyOrder.depositCents,
                balanceCents: guestOnlyOrder.balanceCents,
              },
            )
          }}
        >
          保存重分配
        </button>
      )
    }

    renderHarness(<Harness />)

    await user.click(screen.getByRole('button', { name: '保存重分配' }))

    await waitFor(() =>
      expect(getGuestCollectionChangeImpact).toHaveBeenCalledWith(
        'order-1',
        expect.any(AbortSignal),
      ),
    )
    expect(saveMutate).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('关联流水金额可能受影响').length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/定金 ¥4,000\.00 → ¥3,000\.00/)).toBeInTheDocument()
    expect(within(dialog).getByText(/尾款 ¥6,000\.00 → ¥7,000\.00/)).toBeInTheDocument()
  })
})
