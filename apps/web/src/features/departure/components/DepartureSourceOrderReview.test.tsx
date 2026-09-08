import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DepartureSourceOrderReview } from './DepartureSourceOrderReview'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'

const accept = vi.fn()
const result = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/services/ai-create-task.service', () => ({
  listDepartureCollaboration: async () => ({
    items: ['first', 'second'].map((id) => ({ id, version: 2, status: 'pending', payloadSchema: 'source_order.create@v1', conversationId: 'conversation' })),
    confirmations: [],
  }),
  patchAiReviewPackage: vi.fn(),
  acceptReviewConfirmation: (...args: unknown[]) => accept(...args),
  getReviewConfirmation: (...args: unknown[]) => result(...args),
}))
vi.mock('@/features/ai-assist/SourceOrderReviewPanel', () => ({
  SourceOrderReviewPanel: ({ pendingReview, onConfirm }: { pendingReview: { id: string }; onConfirm: () => Promise<void> }) =>
    <button onClick={() => void onConfirm().catch(() => undefined)}>确认 {pendingReview.id}</button>,
}))
afterEach(cleanup)
it('confirms the selected source order and reuses the command after an uncertain response', async () => {
  useAgentConversationStore.setState({ conversationId: 'conversation' })
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
