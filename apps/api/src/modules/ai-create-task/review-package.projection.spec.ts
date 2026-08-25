import { AiReviewPackageStatus } from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { projectPendingReviewPackage } from './review-package.projection'

const reviewPackage: SubmitReviewPackageModelInput = {
  objectVersion: 1,
  confirmationUnit: 'basic_info_draft',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '候选团名',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', excerpt: '团名叫候选团名', sequence: 1 }],
    },
  ],
}

const snapshot = { name: '原团名' }

const racedPackage = {
  id: 'pkg-raced',
  sourceActionId: 'action-first',
  candidates: [{ fieldKey: 'name' }],
}

function createTx(options?: {
  existing?: { id: string; sourceActionId: string | null; candidates: unknown }
  draftVersion?: number
  uniqueOnCreate?: boolean
  raced?: { id: string; sourceActionId: string | null; candidates: unknown } | null
}) {
  const created = { id: 'pkg-new' }
  const draftUpdate = jest.fn()
  const reviewCreate = jest.fn().mockImplementation(async () => {
    if (options?.uniqueOnCreate) {
      const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      throw error
    }
    return created
  })
  const reviewFindFirst = jest.fn()
  if (options?.uniqueOnCreate) {
    reviewFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(options.raced === undefined ? racedPackage : options.raced)
  } else {
    reviewFindFirst.mockResolvedValue(options?.existing ?? null)
  }
  const tx = {
    aiCreateTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'task-1',
        draft: { id: 'draft-1', version: options?.draftVersion ?? 1, snapshot },
      }),
    },
    departureCreationDraft: { update: draftUpdate, updateMany: draftUpdate },
    aiReviewPackage: {
      create: reviewCreate,
      findFirst: reviewFindFirst,
    },
  }
  return { tx, reviewCreate, draftUpdate }
}

describe('projectPendingReviewPackage', () => {
  it('creates a pending package sourced from the first successful write action and does not write the draft', async () => {
    const { tx, reviewCreate, draftUpdate } = createTx()

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      attemptId: 'attempt-1',
      runId: 'run-1',
      reviewPackage,
      sourceActionId: 'action-first',
    })

    expect(id).toBe('pkg-new')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: AiReviewPackageStatus.pending,
        capabilityKey: 'departure.review-package.propose',
        targetKind: 'departure_creation_draft',
        targetId: 'draft-1',
        conversation: { connect: { id: 'conv-1' } },
        inputBatch: { connect: { id: 'batch-1' } },
        sourceAction: { connect: { id: 'action-first' } },
        baseObjectVersion: 1,
      }),
    })
    expect(draftUpdate).not.toHaveBeenCalled()
  })

  it('reuses the same proposal identity without rewriting the original package', async () => {
    const existing = {
      id: 'pkg-existing',
      sourceActionId: 'action-first',
      candidates: [{ fieldKey: 'name' }],
    }
    const { tx, reviewCreate } = createTx({ existing })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-2',
      inputBatchId: 'batch-1',
      runId: 'run-2',
      reviewPackage,
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-existing')
    expect(reviewCreate).not.toHaveBeenCalled()
  })

  it('does not treat a different conversation pending package as a task-level lock', async () => {
    const { tx, reviewCreate } = createTx()

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-b',
      inputBatchId: 'batch-b',
      runId: 'run-b',
      reviewPackage,
      sourceActionId: 'action-b',
    })

    expect(id).toBe('pkg-new')
    expect(reviewCreate).toHaveBeenCalled()
  })

  it('does not create a package when the draft version does not match', async () => {
    const { tx, reviewCreate } = createTx({ draftVersion: 2 })

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-1',
        conversationId: 'conv-1',
        inputBatchId: 'batch-1',
        runId: 'run-1',
        reviewPackage,
        sourceActionId: 'action-first',
      }),
    ).rejects.toThrow('VERSION_CONFLICT')

    expect(reviewCreate).not.toHaveBeenCalled()
  })

  it('replays the existing package when concurrent creates race the proposal identity unique index', async () => {
    const { tx, reviewCreate } = createTx({ uniqueOnCreate: true })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      runId: 'run-1',
      reviewPackage,
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-raced')
    expect(reviewCreate).toHaveBeenCalled()
  })

  it('rethrows the unique violation when the raced package cannot be found by identity', async () => {
    const { tx } = createTx({ uniqueOnCreate: true, raced: null })

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-1',
        conversationId: 'conv-1',
        inputBatchId: 'batch-1',
        runId: 'run-1',
        reviewPackage,
        sourceActionId: 'action-later',
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('does not create a package when the source AI action is missing', async () => {
    const { tx, reviewCreate } = createTx()

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-1',
        conversationId: 'conv-1',
        inputBatchId: 'batch-1',
        runId: 'run-1',
        reviewPackage,
        sourceActionId: '',
      }),
    ).rejects.toThrow('REVIEW_PACKAGE_MISSING_ACTION')

    expect(reviewCreate).not.toHaveBeenCalled()
  })
})
