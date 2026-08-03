import type { PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelVerification, createVerification } from '@/services/finance.service'
import { useVerificationWorkspaceMutations } from './useVerificationWorkspaceMutations'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/services/finance.service', () => ({
  cancelVerification: vi.fn(),
  createVerification: vi.fn(),
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <App>{children}</App>
      </QueryClientProvider>
    )
  }
}

function renderMutations() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  const result = renderHook(
    () =>
      useVerificationWorkspaceMutations({
        form: { resetFields: vi.fn() } as never,
        cancelForm: { resetFields: vi.fn() } as never,
        onCreateSuccess: vi.fn(),
        onCancelSuccess: vi.fn(),
      }),
    { wrapper: createWrapper(queryClient) },
  ).result

  return { result, invalidateQueries }
}

describe('useVerificationWorkspaceMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createVerification).mockResolvedValue({ generatedRebatePayable: null } as never)
    vi.mocked(cancelVerification).mockResolvedValue({} as never)
  })

  it('创建核销未使用发团筛选时仍刷新所属发团详情', async () => {
    const { result, invalidateQueries } = renderMutations()

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        direction: 'receivable',
        verificationDate: '2026-08-02',
        transactionId: 'transaction-1',
        paymentScheduleId: 'schedule-1',
        amountYuan: 100,
        affectedDepartureIds: ['dep-1'],
      })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure', 'dep-1'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['source-orders', 'dep-1'] })
  })

  it('撤销核销后刷新所属发团详情', async () => {
    const { result, invalidateQueries } = renderMutations()

    act(() => {
      result.current.openCancelModal({ departureId: 'dep-1' } as never)
    })
    await act(async () => {
      await result.current.cancelMutation.mutateAsync({
        id: 'verification-1',
        cancelReason: '录入错误',
      })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure-verifications'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure-receivables'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['departure-payables'] })
  })

  it('跨团核销后分别刷新流水与节点所属发团', async () => {
    const { result, invalidateQueries } = renderMutations()

    await act(async () => {
      await result.current.createMutation.mutateAsync({
        direction: 'receivable',
        verificationDate: '2026-08-02',
        transactionId: 'transaction-1',
        paymentScheduleId: 'schedule-1',
        amountYuan: 100,
        affectedDepartureIds: ['dep-transaction', 'dep-schedule'],
      })
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['departure', 'dep-transaction'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['departure', 'dep-schedule'],
    })
  })
})
