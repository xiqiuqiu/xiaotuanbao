import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DepartureSourceOrderReview } from './DepartureSourceOrderReview'
import { ApiError } from '@/lib/request/client'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'

const reject = vi.fn()
const cancel = vi.fn()
const accept = vi.fn()
const result = vi.fn()
const listCollaboration = vi.fn()
const prepareReceivable = vi.fn()
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/services/ai-create-task.service', () => ({
  listDepartureCollaboration: (...args: unknown[]) => listCollaboration(...args),
  patchAiReviewPackage: vi.fn(),
  rejectAiReviewPackage: (...args: unknown[]) => reject(...args),
  cancelAiReviewPackage: (...args: unknown[]) => cancel(...args),
  acceptReviewConfirmation: (...args: unknown[]) => accept(...args),
  getReviewConfirmation: (...args: unknown[]) => result(...args),
}))
vi.mock('@/services/agent-collaboration.service', () => ({
  prepareSourceOrderReceivableReview: (...args: unknown[]) => prepareReceivable(...args),
}))
vi.mock('@/features/ai-assist/SourceOrderReviewPanel', () => ({
  SourceOrderReviewPanel: ({
    pendingReview,
    onConfirm,
    onReject,
    onCancel,
    createdSourceOrderId,
    onContinueReceivables,
  }: {
    pendingReview?: { id: string }
    onConfirm?: () => Promise<void>
    onReject?: () => Promise<void>
    onCancel?: () => Promise<void>
    createdSourceOrderId?: string
    onContinueReceivables?: (sourceOrderId: string) => void
  }) =>
    createdSourceOrderId ? (
      <button onClick={() => onContinueReceivables?.(createdSourceOrderId)}>继续提交应收</button>
    ) : (
      <>
        <button onClick={() => void onConfirm?.().catch(() => undefined)}>确认 {pendingReview?.id}</button>
        <button onClick={() => void onReject?.().catch(() => undefined)}>拒绝建议</button>
        <button onClick={() => void onCancel?.().catch(() => undefined)}>取消审核</button>
      </>
    ),
}))
afterEach(() => {
  cleanup()
  reject.mockReset()
  cancel.mockReset()
  accept.mockReset()
  result.mockReset()
  listCollaboration.mockReset()
  prepareReceivable.mockReset()
  navigate.mockReset()
})
it('confirms the selected source order and reuses the command after an uncertain response', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  listCollaboration.mockResolvedValue({
    items: ['first', 'second'].map((id) => ({
      id,
      version: 2,
      status: 'pending',
      payloadSchema: 'source_order.create@v1',
      conversationId: 'conversation',
    })),
    confirmations: [],
  })
  accept.mockImplementation(async (input) => ({ ...input, accepted: true }))
  result.mockRejectedValueOnce(new Error('连接中断')).mockImplementation(async (id) => ({
    decisionCommandId: id, items: [{ packageId: 'second', status: 'succeeded' }],
  }))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <App><DepartureSourceOrderReview departureId="departure" canEdit packageId="second" /></App>
  </QueryClientProvider>)
  fireEvent.click(await screen.findByText('确认 second'))
  await waitFor(() => expect(result).toHaveBeenCalledTimes(1))
  await screen.findByText('连接中断')
  fireEvent.click(screen.getByText('确认 second'))
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(2))
  expect(accept.mock.calls[0][0]).toEqual(accept.mock.calls[1][0])
  expect(accept.mock.calls[0][0].items).toEqual([{ packageId: 'second', expectedPackageVersion: 2 }])
})

it('lets finance without departure:write prepare receivables from the created result', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  const onPrepared = vi.fn()
  listCollaboration.mockResolvedValue({
    items: [{ id: 'second', version: 2, status: 'confirmed', payloadSchema: 'source_order.create@v1' }],
    confirmations: [
      {
        items: [
          {
            packageId: 'second',
            status: 'succeeded',
            resultRef: { objectKind: 'source_order', objectId: 'so-1' },
          },
        ],
      },
    ],
  })
  prepareReceivable.mockResolvedValue({ id: 'pkg-recv' })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <DepartureSourceOrderReview
          departureId="departure"
          canEdit={false}
          packageId="second"
          onPreparedReceivableReview={onPrepared}
        />
      </App>
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByText('继续提交应收'))
  await waitFor(() => expect(prepareReceivable).toHaveBeenCalledWith('departure', {
    sourceOrderId: 'so-1',
    conversationId: 'conversation',
  }))
  expect(onPrepared).toHaveBeenCalledWith('pkg-recv')
})

it('prepares an independent receivable review instead of leaving for the ordinary tab', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  const onPrepared = vi.fn()
  listCollaboration.mockResolvedValue({
    items: [{ id: 'second', version: 2, status: 'confirmed', payloadSchema: 'source_order.create@v1' }],
    confirmations: [
      {
        items: [
          {
            packageId: 'second',
            status: 'succeeded',
            resultRef: { objectKind: 'source_order', objectId: 'so-1' },
          },
        ],
      },
    ],
  })
  prepareReceivable.mockResolvedValue({ id: 'pkg-recv' })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <DepartureSourceOrderReview
          departureId="departure"
          canEdit
          packageId="second"
          onPreparedReceivableReview={onPrepared}
        />
      </App>
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByText('继续提交应收'))
  await waitFor(() => expect(prepareReceivable).toHaveBeenCalledWith('departure', {
    sourceOrderId: 'so-1',
    conversationId: 'conversation',
  }))
  expect(onPrepared).toHaveBeenCalledWith('pkg-recv')
  expect(navigate).not.toHaveBeenCalled()
})

it.each(['reject', 'cancel'] as const)('disposes only the selected review with its expected version: %s', async (action) => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  listCollaboration.mockResolvedValue({
    items: ['first', 'second'].map((id) => ({
      id, version: 2, status: 'pending', payloadSchema: 'source_order.create@v1',
      conversationId: 'conversation',
    })), confirmations: [],
  })
  const leave = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><App>
    <DepartureSourceOrderReview departureId="departure" canEdit packageId="second" onLeaveWorkspace={leave} />
  </App></QueryClientProvider>)
  await screen.findByText('确认 second')
  fireEvent.click(screen.getByText(action === 'reject' ? '拒绝建议' : '取消审核'))
  await waitFor(() => expect(action === 'reject' ? reject : cancel).toHaveBeenCalledWith(
    'conversation', 'second', { expectedPackageVersion: 2 },
  ))
  await waitFor(() => expect(listCollaboration).toHaveBeenCalledTimes(2))
  expect(leave).not.toHaveBeenCalled()
  expect(accept).not.toHaveBeenCalled()
  expect(prepareReceivable).not.toHaveBeenCalled()
})

it('refreshes the source list when a late confirmation result arrives', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  listCollaboration.mockResolvedValue({ items: [], confirmations: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><App>
    <DepartureSourceOrderReview departureId="departure" canEdit packageId="second" />
  </App></QueryClientProvider>)
  await waitFor(() => expect(listCollaboration).toHaveBeenCalledTimes(1))
  client.setQueryData(['departure-collaboration', 'departure', 'conversation'], {
    items: [], confirmations: [{ items: [{ packageId: 'second', status: 'succeeded',
      resultRef: { objectKind: 'source_order', objectId: 'so-1' },
    }] }],
  })
  await screen.findByText('继续提交应收')
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['source-orders', 'departure'] }))
})

it('keeps a conflicting review open after a stale disposition fails and refreshes its version', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
  listCollaboration.mockResolvedValue({ items: [{
    id: 'second', version: 3, status: 'conflict', payloadSchema: 'source_order.create@v1',
    conversationId: 'conversation',
  }], confirmations: [] })
  reject.mockRejectedValue(new ApiError('VERSION_CONFLICT', 409))
  const leave = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><App>
    <DepartureSourceOrderReview departureId="departure" canEdit packageId="second" onLeaveWorkspace={leave} />
  </App></QueryClientProvider>)
  fireEvent.click(await screen.findByText('拒绝建议'))
  await screen.findByText('审核包版本已变化，请核对最新内容后重试')
  expect(reject).toHaveBeenCalledWith('conversation', 'second', { expectedPackageVersion: 3 })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['departure-collaboration', 'departure'] })
  expect(leave).not.toHaveBeenCalled()
  expect(accept).not.toHaveBeenCalled()
})
