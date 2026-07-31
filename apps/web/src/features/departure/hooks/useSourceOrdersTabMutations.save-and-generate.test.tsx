import { cleanup, render, waitFor } from '@testing-library/react'
import { ConfigProvider, message } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import type { DepartureDetail } from '@/types/api'
import { useSourceOrdersTabMutations } from './useSourceOrdersTabMutations'
import type { DrawerState } from '../components/source-orders-tab-state'

const createSourceOrder = vi.fn()
const generateReceivables = vi.fn()
const updateSourceOrder = vi.fn()

vi.mock('@/services/source-order.service', () => ({
  createSourceOrder: (...args: unknown[]) => createSourceOrder(...args),
  updateSourceOrder: (...args: unknown[]) => updateSourceOrder(...args),
  deleteSourceOrder: vi.fn(),
  generateReceivables: (...args: unknown[]) => generateReceivables(...args),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(),
  createSourceOrderGuest: vi.fn(),
  updateSourceOrderGuest: vi.fn(),
  deleteSourceOrderGuest: vi.fn(),
  listSourceOrderGuests: vi.fn(async () => []),
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070009',
  name: '测试团',
} as DepartureDetail

const drawer: DrawerState = {
  drawerOpen: true,
  editingOrder: null,
  viewOnly: false,
  guestDrawerOpen: false,
  guestOrder: null,
}

const payload = {
  partnerId: 'partner-1',
  adultGuestCount: 1,
  childGuestCount: 0,
  adultUnitPriceCents: 100000,
  childUnitPriceCents: 0,
  discountType: 'none',
  discountCents: 0,
  discountNotes: null,
  collectionMode: 'guest_only',
  depositCents: 0,
  balanceCents: 100000,
  settlementNotes: null,
  notes: null,
}

function Harness({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useSourceOrdersTabMutations>) => void
}) {
  const api = useSourceOrdersTabMutations({
    departure,
    drawer,
    onCloseDrawer: vi.fn(),
  })

  useEffect(() => {
    onReady(api)
  }, [api, onReady])

  return null
}

describe('useSourceOrdersTabMutations save and generate', () => {
  afterEach(() => {
    cleanup()
    createSourceOrder.mockReset()
    updateSourceOrder.mockReset()
    generateReceivables.mockReset()
    message.destroy()
  })

  it('creates the source order then generates receivables', async () => {
    createSourceOrder.mockResolvedValue({ id: 'order-new' })
    generateReceivables.mockResolvedValue({ sourceAmountMismatch: false })
    const successSpy = vi.spyOn(message, 'success')

    let api: ReturnType<typeof useSourceOrdersTabMutations> | undefined
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <Harness
            onReady={(value) => {
              api = value
            }}
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(api).toBeDefined())
    api!.saveAndGenerateMutation.mutate({ payload } as never)

    await waitFor(() => {
      expect(createSourceOrder).toHaveBeenCalledWith('departure-1', payload)
      expect(generateReceivables).toHaveBeenCalledWith('order-new')
      expect(successSpy).toHaveBeenCalledWith('已保存并提交应收')
    })

    successSpy.mockRestore()
  })

  it('warns when save succeeds but generate fails', async () => {
    createSourceOrder.mockResolvedValue({ id: 'order-new' })
    generateReceivables.mockRejectedValue(new Error('路径金额须大于 0'))
    const warningSpy = vi.spyOn(message, 'warning')

    let api: ReturnType<typeof useSourceOrdersTabMutations> | undefined
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <Harness
            onReady={(value) => {
              api = value
            }}
          />
        </ConfigProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(api).toBeDefined())
    api!.saveAndGenerateMutation.mutate({ payload } as never)

    await waitFor(() => {
      expect(createSourceOrder).toHaveBeenCalled()
      expect(generateReceivables).toHaveBeenCalledWith('order-new')
      expect(warningSpy).toHaveBeenCalledWith(
        '客源单已保存，但提交应收失败：路径金额须大于 0',
      )
    })

    warningSpy.mockRestore()
  })
})
