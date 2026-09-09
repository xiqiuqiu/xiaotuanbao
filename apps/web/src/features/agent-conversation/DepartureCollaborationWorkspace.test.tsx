import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
vi.mock('./DepartureResourceReviewPanel', () => ({
  DepartureResourceReviewPanel: ({ onlyPackageId }: { onlyPackageId: string }) => (
    <div>发团级资源审核 {onlyPackageId}</div>
  ),
}))
vi.mock('./AgentConversationChat', () => ({
  AgentConversationChat: ({ onReviewRequested, reviewPackageId, onReviewMessageSent }: {
    onReviewRequested: (id: string) => void
    reviewPackageId?: string
    onReviewMessageSent?: (id: string) => void
  }) => {
    const [text, setText] = useState('')
    return (
      <>
        <textarea
          aria-label="会话输入"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <ButtonForTest onClick={() => onReviewRequested('resource-1')} />
        <button onClick={() => reviewPackageId && onReviewMessageSent?.(reviewPackageId)}
          data-review-package-id={reviewPackageId}>发送定向问题</button>
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
const departureResource = 'departure.departure_resource@v1'
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
        : [
            item('source-1', source),
            item('source-2', source),
            item('resource-1', resource),
            item('departure-resource-1', departureResource),
          ],
    confirmations: [],
  }))
})
afterEach(cleanup)
it('binds questions to a package ID while retaining the draft, and clears only after sending', async () => {
  const client = new QueryClient()
  const rendered = render(<QueryClientProvider client={client}>{view(true)}</QueryClientProvider>)
  fireEvent.change(screen.getByLabelText('会话输入'), { target: { value: '请核对早餐' } })
  fireEvent.click(await screen.findByRole('tab', { name: 'resource-1 待审核' }))
  fireEvent.click(screen.getByRole('button', { name: '针对此项提问' }))
  expect(screen.getByLabelText('会话输入')).toHaveValue('请核对早餐')
  expect(screen.getByRole('button', { name: '发送定向问题' })).toHaveAttribute('data-review-package-id', 'resource-1')
  expect(sessionStorage.getItem('collaboration-question:dep-1:conv-1')).toBe('resource-1')
  rendered.unmount()
  render(<QueryClientProvider client={client}>{view(true)}</QueryClientProvider>)
  expect(screen.getByText('针对：resource-1')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '协作二' }))
  expect(screen.getByRole('button', { name: '发送定向问题' })).not.toHaveAttribute('data-review-package-id')
  fireEvent.click(await screen.findByRole('button', { name: '协作一' }))
  expect(screen.getByRole('button', { name: '发送定向问题' })).toHaveAttribute('data-review-package-id', 'resource-1')
  fireEvent.click(screen.getByRole('button', { name: '发送定向问题' }))
  expect(screen.queryByText('针对：resource-1')).not.toBeInTheDocument()
  expect(sessionStorage.getItem('collaboration-question:dep-1:conv-1')).toBeNull()
})
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

it('keeps source, segment, and departure resource reviews independent', async () => {
  render(<QueryClientProvider client={new QueryClient()}>{view(true)}</QueryClientProvider>)
  expect(await screen.findByText('客源审核 source-1')).toBeVisible()
  expect(screen.getByRole('tab', { name: 'source-1 待审核' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'resource-1 待审核' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'departure-resource-1 待审核' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('tab', { name: 'resource-1 待审核' }))
  expect(screen.getByText('资源审核 resource-1')).toBeVisible()
  expect(screen.getByText('发团级资源审核 departure-resource-1')).not.toBeVisible()
  expect(screen.getByText('客源审核 source-1')).not.toBeVisible()

  fireEvent.click(screen.getByRole('tab', { name: 'departure-resource-1 待审核' }))
  expect(screen.getByText('发团级资源审核 departure-resource-1')).toBeVisible()
  expect(screen.getByText('资源审核 resource-1')).not.toBeVisible()
  expect(screen.getByText('客源审核 source-1')).not.toBeVisible()
  expect(within(screen.getByRole('tabpanel')).getByText('执行安排')).toBeVisible()

  fireEvent.click(screen.getByRole('tab', { name: 'source-1 待审核' }))
  expect(screen.getByText('客源审核 source-1')).toBeVisible()
  expect(screen.getByText('发团级资源审核 departure-resource-1')).not.toBeVisible()
})

it('opens a confirmed departure resource from the execution tab highlight', async () => {
  getCollaboration.mockImplementation(async () => ({
    conversations: [{ id: 'conv-1', title: '协作一' }],
    items: [item('departure-resource-1', departureResource, 'confirmed')],
    confirmations: [
      {
        decisionCommandId: 'decision-1',
        accepted: true,
        items: [
          {
            packageId: 'departure-resource-1',
            status: 'succeeded',
            resultRef: { objectKind: 'departure_resource', objectId: 'dep-res-9' },
          },
        ],
      },
    ],
  }))
  render(<QueryClientProvider client={new QueryClient()}>{view(true)}</QueryClientProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '查看正式资源' }))
  expect(navigate).toHaveBeenCalledWith({
    to: '/departure/$departureId',
    params: { departureId: 'dep-1' },
    search: { tab: 'execution', highlightDepartureResourceId: 'dep-res-9' },
  })
})

it('keeps CopilotKit attachment menus above the expanded workspace overlay', () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'DepartureCollaborationWorkspace.module.css'),
    'utf8',
  )
  expect(css).toMatch(/\[data-expanded\][\s\S]*?z-index:\s*1001/)
  expect(css).toMatch(/data-radix-popper-content-wrapper[\s\S]*?z-index:\s*1100\s*!important/)
})
