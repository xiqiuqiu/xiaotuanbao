import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiReviewPackageView } from '@/types/api'
import { ReviewMaterialConflicts, ReviewRevisionHistory } from './ReviewRevisionHistory'

const listRevisions = vi.fn()
const patch = vi.fn()
vi.mock('@/services/agent-collaboration.service', () => ({
  listReviewRevisions: (...args: unknown[]) => listRevisions(...args),
}))
vi.mock('@/services/ai-create-task.service', () => ({
  patchAiReviewPackage: (...args: unknown[]) => patch(...args),
}))

const pkg: AiReviewPackageView = {
  id: 'pkg-1', itemIdentity: 'hotel-1', version: 2, status: 'pending',
  confirmationUnit: 'segment_resource', payloadSchema: 'departure.segment_resource@v1',
  schemaSupported: true, baseObjectVersion: 0, runId: null, conversationId: 'conv-1',
  inputBatchId: null, attemptId: null, capabilityKey: 'departure.segment-resource.propose',
  capabilityVersion: 1, targetKind: 'departure', targetId: 'dep-1', proposalHash: 'hash',
  baselineSnapshot: { mode: 'manual', routeName: '' },
  candidates: [],
  conflicts: [{ fieldKey: 'amountCents', proposedValue: 26000, userCorrectedValue: 23000 }],
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows before and after values from persisted revisions without offering rollback', async () => {
  listRevisions.mockResolvedValue([{
    id: 'rev-1', packageId: 'pkg-1', packageVersion: 2, action: 'revise',
    operatorUserId: 'user-1', createdAt: '2026-09-08T10:00:00Z',
    beforeSnapshot: { title: '旧报价', amountCents: 20000 },
    afterSnapshot: { title: '新报价', amountCents: 26000 },
  }])
  render(<QueryClientProvider client={new QueryClient()}>
    <ReviewRevisionHistory pkg={pkg} focused />
  </QueryClientProvider>)
  fireEvent.click(await screen.findByText('历次修改（1）'))
  await waitFor(() => expect(screen.getByText('旧报价 → 新报价')).toBeVisible())
  expect(screen.getByText('200.00 元 → 260.00 元')).toBeVisible()
  expect(screen.queryByRole('button', { name: /回滚/ })).not.toBeInTheDocument()
  expect(listRevisions).toHaveBeenCalledWith('pkg-1')
})

it.each([
  ['保留我的修改', 23000],
  ['采用新建议', 26000],
])('resolves one conflicting field via the versioned correction API: %s', async (label, value) => {
  patch.mockResolvedValue({})
  render(<QueryClientProvider client={new QueryClient()}>
    <ReviewMaterialConflicts pkg={pkg} canEdit />
  </QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(patch).toHaveBeenCalledWith('', 'pkg-1', {
    expectedPackageVersion: 2, corrections: { amountCents: value },
  }))
})
