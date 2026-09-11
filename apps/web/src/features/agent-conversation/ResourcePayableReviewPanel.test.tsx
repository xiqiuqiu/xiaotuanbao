import { App } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { ResourcePayableReviewPanel } from './ResourcePayableReviewPanel'

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

function pkg(overrides?: Partial<AiReviewPackageView>): AiReviewPackageView {
  return {
    id: 'pkg-pay',
    status: 'pending',
    confirmationUnit: 'resource_payable',
    payloadSchema: 'resource.payable@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    capabilityKey: 'departure.resource-payable.prepare',
    capabilityVersion: 1,
    targetKind: 'departure',
    targetId: 'departure-1',
    proposalHash: 'a'.repeat(64),
    baselineSnapshot: { sourceType: 'segment_resource', sourceId: 'res-1' },
    candidates: [
      {
        fieldKey: 'sourceType',
        proposedValue: 'segment_resource',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'sourceId',
        proposedValue: 'res-1',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'title',
        proposedValue: '4月2日住宿',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'resourceKind',
        proposedValue: 'hotel',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'supplierName',
        proposedValue: '关西酒店',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'amountCents',
        proposedValue: 880_000,
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'historyStatus',
        proposedValue: 'ready',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
      },
      {
        fieldKey: 'historyMessage',
        proposedValue: '以下为约定应付，确认后按该项提交；不是付款或流水。',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
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
        <ResourcePayableReviewPanel
          departureId="departure-1"
          conversationId="conv-1"
          onlyPackageId="pkg-pay"
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

it('confirms one selected resource payable without a segment batch action', async () => {
  acceptReviewConfirmation.mockResolvedValue({
    decisionCommandId: 'd-1',
    accepted: true,
    items: [{ packageId: 'pkg-pay', status: 'succeeded' }],
  })
  renderPanel()
  expect(await screen.findByText('4月2日住宿')).toBeInTheDocument()
  expect(screen.getByText('关西酒店')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认提交约定应付' }))
  await waitFor(() => expect(acceptReviewConfirmation).toHaveBeenCalledTimes(1))
  expect(acceptReviewConfirmation).toHaveBeenCalledWith({
    decisionCommandId: expect.any(String),
    items: [{ packageId: 'pkg-pay', expectedPackageVersion: 1 }],
  })
})

it('does not require departure write permission to confirm payables', async () => {
  renderPanel()
  expect(await screen.findByRole('button', { name: '确认提交约定应付' })).toBeEnabled()
})

it('explains cancelled or voided history and sends the user to ordinary payables', async () => {
  renderPanel(
    pkg({
      candidates: pkg().candidates.map((candidate) =>
        candidate.fieldKey === 'historyStatus'
          ? { ...candidate, proposedValue: 'anomaly' }
          : candidate.fieldKey === 'historyMessage'
            ? {
                ...candidate,
                proposedValue: '该资源存在已取消的应付节点，不能通过助手补建或恢复。请在普通业务入口处理。',
              }
            : candidate,
      ),
    }),
  )
  expect(await screen.findByText(/不能通过助手补建或恢复/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认提交约定应付' })).toBeDisabled()
  fireEvent.click(screen.getAllByRole('button', { name: '前往普通应付处理' })[0]!)
  expect(closeGlobalForBusinessNavigation).toHaveBeenCalled()
  expect(navigate).toHaveBeenCalledWith({
    to: '/departure/$departureId',
    params: { departureId: 'departure-1' },
    search: { tab: 'payables', highlightSegmentResourceId: 'res-1' },
  })
})

it('shows already-present success without claiming a newly created payable', async () => {
  renderPanel(
    pkg({
      status: 'confirmed',
      candidates: pkg().candidates.map((candidate) =>
        candidate.fieldKey === 'historyStatus'
          ? { ...candidate, proposedValue: 'complete_and_consistent' }
          : candidate,
      ),
    }),
  )
  expect(await screen.findByText('已有约定应付与当前约定一致')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认提交约定应付' })).not.toBeInTheDocument()
})
