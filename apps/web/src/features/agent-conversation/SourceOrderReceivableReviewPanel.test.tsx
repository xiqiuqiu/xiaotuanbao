import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { SourceOrderReceivableReviewPanel } from './SourceOrderReceivableReviewPanel'

const acceptReviewConfirmation = vi.fn()
const getReviewConfirmation = vi.fn()
const getDepartureCollaboration = vi.fn()
const navigate = vi.fn()
const closeGlobalForBusinessNavigation = vi.fn()

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('./agent-conversation.store', () => ({
  useAgentConversationStore: Object.assign(
    (selector: (state: { closeGlobalForBusinessNavigation: () => void }) => unknown) =>
      selector({ closeGlobalForBusinessNavigation }),
    { getState: () => ({ closeGlobalForBusinessNavigation }) },
  ),
}))
vi.mock('@/services/agent-collaboration.service', () => ({
  acceptReviewConfirmation: (...args: unknown[]) => acceptReviewConfirmation(...args),
  getReviewConfirmation: (...args: unknown[]) => getReviewConfirmation(...args),
  getDepartureCollaboration: (...args: unknown[]) => getDepartureCollaboration(...args),
}))

const paths = [
  {
    sourceType: 'source_order_guest_balance_collection',
    title: '尾款代收',
    amountCents: 4_100_000,
    counterpartyType: 'guest',
    counterpartyName: '华东旅行社客源',
  },
  {
    sourceType: 'source_order_customer_settlement',
    title: '客户补款',
    amountCents: 2_000_000,
    counterpartyType: 'partner',
    counterpartyName: '华东旅行社',
  },
]

function pkg(overrides?: Partial<AiReviewPackageView>): AiReviewPackageView {
  return {
    id: 'pkg-recv',
    status: 'pending',
    confirmationUnit: 'source_order_receivable',
    payloadSchema: 'source_order.receivable@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    capabilityKey: 'departure.source-order-receivable.prepare',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'departure-1',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: { sourceOrderId: 'so-1' },
    candidates: [
      {
        fieldKey: 'sourceOrderId',
        proposedValue: 'so-1',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'displayName',
        proposedValue: '华东旅行社客源',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'partnerName',
        proposedValue: '华东旅行社',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'collectionMode',
        proposedValue: 'split',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'netReceivableCents',
        proposedValue: 6_100_000,
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'paths',
        proposedValue: paths,
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'historyStatus',
        proposedValue: 'ready',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
      {
        fieldKey: 'historyMessage',
        proposedValue: '以下为约定应收，确认后整单提交；不是到账或流水。',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
      },
    ],
    ...overrides,
  }
}

function renderPanel(item = pkg()) {
  getDepartureCollaboration.mockResolvedValue({
    items: [item],
    confirmations: [],
  })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <SourceOrderReceivableReviewPanel
          departureId="departure-1"
          conversationId="conv-1"
          onlyPackageId="pkg-recv"
        />
      </App>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  acceptReviewConfirmation.mockReset()
  getReviewConfirmation.mockReset()
  getDepartureCollaboration.mockReset()
  navigate.mockReset()
  closeGlobalForBusinessNavigation.mockReset()
})

it('lists every applicable path and confirms the whole source order', async () => {
  acceptReviewConfirmation.mockResolvedValue({
    decisionCommandId: 'd-1',
    accepted: true,
    items: [{ packageId: 'pkg-recv', status: 'succeeded' }],
  })
  renderPanel()
  expect(await screen.findByText('尾款代收')).toBeInTheDocument()
  expect(screen.getByText('客户补款')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /取消/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认提交约定应收' }))
  await waitFor(() => expect(acceptReviewConfirmation).toHaveBeenCalledTimes(1))
  expect(acceptReviewConfirmation).toHaveBeenCalledWith({
    decisionCommandId: expect.any(String),
    items: [{ packageId: 'pkg-recv', expectedPackageVersion: 1 }],
  })
})

it('does not require departure write permission to confirm receivables', async () => {
  renderPanel()
  expect(await screen.findByRole('button', { name: '确认提交约定应收' })).toBeEnabled()
})

it('shows success when the package is confirmed even if confirmation items are missing', async () => {
  renderPanel(pkg({ status: 'confirmed' }))
  expect(await screen.findByText('约定应收已提交')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看应收' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认提交约定应收' })).not.toBeInTheDocument()
})

it('explains F2 anomalies and sends the user to ordinary receivables', async () => {
  renderPanel(
    pkg({
      candidates: pkg().candidates.map((candidate) =>
        candidate.fieldKey === 'historyStatus'
          ? { ...candidate, proposedValue: 'anomaly' }
          : candidate.fieldKey === 'historyMessage'
            ? {
                ...candidate,
                proposedValue: '已有应收不完整，请到普通业务入口处理，系统不会自动补建。',
              }
            : candidate,
      ),
    }),
  )
  expect(await screen.findByText(/不会自动补建/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认提交约定应收' })).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: '前往普通应收处理' })[0]!)
  expect(closeGlobalForBusinessNavigation).toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith({
    to: '/departure/$departureId',
    params: { departureId: 'departure-1' },
    search: { tab: 'receivables', sourceId: 'so-1' },
  })
})
