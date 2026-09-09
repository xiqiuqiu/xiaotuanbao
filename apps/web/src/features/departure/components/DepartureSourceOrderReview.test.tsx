import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DepartureSourceOrderReview } from './DepartureSourceOrderReview'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'

const accept = vi.fn()
const result = vi.fn()
const listCollaboration = vi.fn()
const prepareReceivable = vi.fn()
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/services/ai-create-task.service', () => ({
  listDepartureCollaboration: (...args: unknown[]) => listCollaboration(...args),
  patchAiReviewPackage: vi.fn(),
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
    createdSourceOrderId,
    onContinueReceivables,
  }: {
    pendingReview?: { id: string }
    onConfirm?: () => Promise<void>
    createdSourceOrderId?: string
    onContinueReceivables?: (sourceOrderId: string) => void
  }) =>
    createdSourceOrderId ? (
      <button onClick={() => onContinueReceivables?.(createdSourceOrderId)}>继续提交应收</button>
    ) : (
      <button onClick={() => void onConfirm?.().catch(() => undefined)}>确认 {pendingReview?.id}</button>
    ),
}))
afterEach(() => {
  cleanup()
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
