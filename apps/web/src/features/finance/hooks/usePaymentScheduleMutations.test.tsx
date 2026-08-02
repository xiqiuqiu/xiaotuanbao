import type { PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelSchedule } from '@/services/finance.service'
import { usePaymentScheduleMutations } from './usePaymentScheduleMutations'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
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

describe('usePaymentScheduleMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cancelSchedule).mockResolvedValue({} as never)
  })

  it('关闭收付款节点后刷新所属发团详情', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const form = { resetFields: vi.fn() } as never
    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <App>{children}</App>
        </QueryClientProvider>
      )
    }
    const { result } = renderHook(
      () =>
        usePaymentScheduleMutations({
          queryClient,
          isReceivable: true,
          listQueryKey: 'finance-receivables',
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
    )

    await act(async () => {
      await result.current.cancelMutation.mutateAsync({
        closeDisposition: 'waived' as never,
        cancelReason: '不再收款',
      })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure', 'dep-1'] })
  })
})
