import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as financeService from '@/services/finance.service'
import { TransactionsWorkspace } from './TransactionsWorkspace'
import { VerificationsWorkspace } from './VerificationsWorkspace'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

function renderWorkspace(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>{node}</ConfigProvider>
    </QueryClientProvider>,
  )
}

const emptyTransactions = { items: [], total: 0, page: 1, pageSize: 10 }
const emptyVerifications = { items: [], total: 0, page: 1, pageSize: 10 }

describe('finance workspace query states', () => {
  beforeEach(() => {
    vi.spyOn(financeService, 'listFinanceDepartureOptions').mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    navigate.mockReset()
    vi.useRealTimers()
  })

  it('retries a failed transaction list and restores the table', async () => {
    const listTransactions = vi
      .spyOn(financeService, 'listTransactions')
      .mockRejectedValueOnce(new Error('流水接口不可用'))
      .mockResolvedValueOnce(emptyTransactions)

    renderWorkspace(<TransactionsWorkspace scope="global" />)

    expect(await screen.findByText('流水列表加载失败')).toBeInTheDocument()
    expect(screen.getByText('流水接口不可用')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))

    await waitFor(() => expect(listTransactions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('流水列表加载失败')).not.toBeInTheDocument())
    expect(document.querySelector('.ant-table')).not.toBeNull()
  })

  it('retries a failed verification list and restores the table', async () => {
    const listVerifications = vi
      .spyOn(financeService, 'listVerifications')
      .mockRejectedValueOnce(new Error('核销接口不可用'))
      .mockResolvedValueOnce(emptyVerifications)

    renderWorkspace(<VerificationsWorkspace scope="global" />)

    expect(await screen.findByText('核销列表加载失败')).toBeInTheDocument()
    expect(screen.getByText('核销接口不可用')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))

    await waitFor(() => expect(listVerifications).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('核销列表加载失败')).not.toBeInTheDocument())
    expect(document.querySelector('.ant-table')).not.toBeNull()
  })

  it('debounces both transaction search fields and aborts the obsolete query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const listTransactions = vi
      .spyOn(financeService, 'listTransactions')
      .mockImplementation(() => new Promise(() => undefined))
    renderWorkspace(<TransactionsWorkspace scope="global" />)
    await waitFor(() => expect(listTransactions).toHaveBeenCalledTimes(1))
    const firstSignal = listTransactions.mock.calls[0]?.[1]
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.type(screen.getByLabelText('往来对象'), '上海')
    await user.type(screen.getByLabelText('流水单号'), 'TX-9')
    expect(listTransactions).toHaveBeenCalledTimes(1)
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)))

    await waitFor(() => expect(listTransactions).toHaveBeenCalledTimes(2))
    expect(listTransactions.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ partnerKeyword: '上海', transactionNo: 'TX-9' }),
    )
    expect(firstSignal?.aborted).toBe(true)
  })

  it('debounces all verification search fields and aborts the obsolete query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const listVerifications = vi
      .spyOn(financeService, 'listVerifications')
      .mockImplementation(() => new Promise(() => undefined))
    renderWorkspace(<VerificationsWorkspace scope="global" />)
    await waitFor(() => expect(listVerifications).toHaveBeenCalledTimes(1))
    const firstSignal = listVerifications.mock.calls[0]?.[1]
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.type(screen.getByLabelText('关联流水单号'), 'TX-8')
    await user.type(screen.getByLabelText('关联账款单号'), 'AR-3')
    await user.type(screen.getByLabelText('发团号/名称关键字'), '西湖')
    expect(listVerifications).toHaveBeenCalledTimes(1)
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)))

    await waitFor(() => expect(listVerifications).toHaveBeenCalledTimes(2))
    expect(listVerifications.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        transactionNo: 'TX-8',
        scheduleNo: 'AR-3',
        departureKeyword: '西湖',
      }),
    )
    expect(firstSignal?.aborted).toBe(true)
  })
})
