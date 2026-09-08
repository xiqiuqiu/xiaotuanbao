import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { DepartureCollaborationWorkspace } from './DepartureCollaborationWorkspace'
import { useAgentConversationStore } from './agent-conversation.store'

const navigate = vi.fn()
vi.mock('@/features/agent-conversation/conversation-materials', () => ({
  ConversationMaterialsTrigger: () => <button>会话资料</button>,
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/services/departure.service', () => ({
  getDeparture: async () => ({
    name: '关西六日',
    departureNo: 'QA-1',
    startDate: '2026-09-01',
    endDate: '2026-09-06',
  }),
}))
const getCollaboration = vi.fn()
vi.mock('@/services/agent-collaboration.service', () => ({
  getDepartureCollaboration: (...args: unknown[]) => getCollaboration(...args),
}))
vi.mock('@/features/departure/components/DepartureSourceOrderReview', () => ({
  DepartureSourceOrderReview: ({ packageId }: { packageId: string }) => (
    <div>客源审核 {packageId}</div>
  ),
}))
vi.mock('./SegmentResourceReviewPanel', () => ({
  SegmentResourceReviewPanel: ({ onlyPackageId }: { onlyPackageId: string }) => (
    <div>资源审核 {onlyPackageId}</div>
  ),
}))
vi.mock('./AgentConversationChat', () => ({
  AgentConversationChat: ({ onReviewRequested }: { onReviewRequested: (id: string) => void }) => {
    const [text, setText] = useState('')
    return (
      <>
        <textarea
          aria-label="会话输入"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <ButtonForTest onClick={() => onReviewRequested('resource-1')} />
      </>
    )
  },
}))
function ButtonForTest({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>查看资源审核</button>
}
const item = (id: string, payloadSchema: string, status = 'pending') => ({
  id,
  payloadSchema,
  status,
  candidates: [{ fieldKey: 'title', proposedValue: id, evidence: [] }],
})
const source = 'source_order.create@v1'
const resource = 'departure.segment_resource@v1'
function view(expanded: boolean, onExpand = vi.fn()) {
  return (
    <DepartureCollaborationWorkspace
      departureId="dep-1"
      expanded={expanded}
      collapsed={false}
      header={<div>侧栏</div>}
      onExpand={onExpand}
      onExit={vi.fn()}
    />
  )
}
beforeEach(() => {
  sessionStorage.clear()
  navigate.mockClear()
  useAgentConversationStore.setState({
    conversationId: 'conv-1',
    title: '协作一',
    returnLocation: null,
  })
  getCollaboration.mockImplementation(async (_id, conversationId) => ({
    conversations: [
      { id: 'conv-1', title: '协作一' },
      { id: 'conv-2', title: '协作二' },
    ],
    items:
      conversationId === 'conv-2'
        ? []
        : [item('source-1', source), item('source-2', source), item('resource-1', resource)],
    confirmations: [],
  }))
})
afterEach(cleanup)
it('keeps one chat mounted when switching between sidebar and three columns', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const rendered = render(view(false), { wrapper })
  const input = screen.getByLabelText('会话输入')
  fireEvent.change(input, { target: { value: '尚未发送的材料' } })
  rendered.rerender(view(true))
  expect(screen.getByLabelText('会话输入')).toBe(input)
  expect(input).toHaveValue('尚未发送的材料')
  const rail = screen.getByRole('complementary', { name: '业务对象' })
  fireEvent.click(await screen.findByRole('tab', { name: 'source-2 待审核' }))
  expect(screen.getByText('客源审核 source-2')).toBeVisible()
  expect(screen.getByRole('tab', { name: 'source-2 待审核' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  fireEvent.click(screen.getByText('查看资源审核'))
  expect(screen.getByText('资源审核 resource-1')).toBeVisible()
  expect(screen.getByRole('complementary', { name: '业务对象' })).toBe(rail)
  rendered.rerender(view(false))
  expect(screen.getByLabelText('会话输入')).toBe(input)
})
it('restores selection after remount and isolates it between conversations', async () => {
  sessionStorage.setItem('collaboration-selection:dep-1:conv-1', 'source-2')
  render(<QueryClientProvider client={new QueryClient()}>{view(true)}</QueryClientProvider>)
  expect(await screen.findByText('客源审核 source-2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '协作二' }))
  expect(await screen.findByText('从材料开始协作')).toBeInTheDocument()
  expect(screen.queryByText('客源审核 source-2')).not.toBeInTheDocument()
})
it('keeps the object rail stable after a package is confirmed', async () => {
  const client = new QueryClient()
  render(<QueryClientProvider client={client}>{view(true)}</QueryClientProvider>)
  await screen.findByText('客源审核 source-1')
  const rail = screen.getByRole('complementary', { name: '业务对象' })
  act(() =>
    client.setQueryData(['departure-collaboration', 'dep-1', 'conv-1'], {
      items: [item('source-1', source, 'confirmed')],
      confirmations: [],
    }),
  )
  expect(screen.getByRole('complementary', { name: '业务对象' })).toBe(rail)
  expect(
    await within(screen.getByRole('region', { name: '事项与审核' })).findByText('审核记录'),
  ).toBeInTheDocument()
})

it('distinguishes an empty category from a conversation without reviews', async () => {
  render(<QueryClientProvider client={new QueryClient()}>{view(true)}</QueryClientProvider>)
  const review = await screen.findByText('客源审核 source-1')
  fireEvent.click(screen.getByRole('button', { name: '财务' }))
  expect(review).toBeInTheDocument()
  expect(review).not.toBeVisible()
  expect(screen.getByRole('button', { name: '财务' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('暂无财务事项')).toBeVisible()
  expect(screen.queryByText('从材料开始协作')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看全部事项' }))
  expect(screen.getByText('客源审核 source-1')).toBe(review)
  expect(review).toBeVisible()
})

it('shows query failures without presenting a misleading empty state', async () => {
  getCollaboration.mockRejectedValue(new Error('offline'))
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {view(true)}
    </QueryClientProvider>,
  )
  expect(await screen.findByText('事项加载失败')).toBeVisible()
  expect(screen.getByText('协作记录加载失败')).toBeVisible()
  expect(screen.queryByText('从材料开始协作')).not.toBeInTheDocument()
})
