import { AiReviewPackageStatus } from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import {
  projectPendingReviewPackage,
  projectPendingReviewPackages,
} from './review-package.projection'

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
  existing?: {
    id: string
    sourceActionId: string | null
    candidates: unknown
    itemIdentity?: string
  }
  existingCount?: number
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
  const reviewFindFirst = jest.fn().mockImplementation(
    ({ where }: { where?: { sourceActionId?: string; inputBatchId?: string; itemIdentity?: string } }) => {
      if (options?.uniqueOnCreate) {
        if (where?.sourceActionId) {
          return Promise.resolve(null)
        }
        if (where?.itemIdentity) {
          return Promise.resolve(
            reviewCreate.mock.calls.length > 0
              ? (options.raced === undefined ? racedPackage : options.raced)
              : null,
          )
        }
        return Promise.resolve(null)
      }
      const existing = options?.existing
      if (!existing) {
        return Promise.resolve(null)
      }
      if (where?.sourceActionId) {
        return Promise.resolve(
          existing.sourceActionId === where.sourceActionId ? existing : null,
        )
      }
      if (where?.itemIdentity) {
        return Promise.resolve(
          (existing.itemIdentity ?? 'item:0') === where.itemIdentity ? existing : null,
        )
      }
      return Promise.resolve(existing)
    },
  )
  const tx = {
    agentTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'task-1',
        type: 'departure_creation',
        departure: null,
        departureCreationTask: {
          draft: { id: 'draft-1', version: options?.draftVersion ?? 1, snapshot },
        },
      }),
    },
    departureCreationDraft: { update: draftUpdate, updateMany: draftUpdate },
    aiReviewPackage: {
      create: reviewCreate,
      findFirst: reviewFindFirst,
      count: jest.fn().mockResolvedValue(options?.existingCount ?? (options?.existing ? 1 : 0)),
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

  it('replays the same write action without allocating another item', async () => {
    const existing = {
      id: 'pkg-existing',
      sourceActionId: 'action-first',
      candidates: [{ fieldKey: 'name' }],
      itemIdentity: 'item:0',
    }
    const { tx, reviewCreate } = createTx({ existing })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-2',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-first',
    })

    expect(id).toBe('pkg-existing')
    expect(reviewCreate).not.toHaveBeenCalled()
  })

  it('allocates a new item identity when another action submits the same content', async () => {
    const { tx, reviewCreate } = createTx({
      existing: {
        id: 'pkg-existing',
        sourceActionId: 'action-first',
        candidates: [{ fieldKey: 'name' }],
        itemIdentity: 'item:0',
      },
      existingCount: 1,
    })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-new')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemIdentity: 'item:1', sourceAction: { connect: { id: 'action-later' } } }),
    })
  })

  it('does not treat a different conversation pending package as a task-level lock', async () => {
    const { tx, reviewCreate } = createTx()

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-b',
      inputBatchId: 'batch-b',
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
        reviewPackage,
        sourceActionId: '',
      }),
    ).rejects.toThrow('REVIEW_PACKAGE_MISSING_ACTION')

    expect(reviewCreate).not.toHaveBeenCalled()
  })

  it('assigns distinct item identities to two same-content packages in one batch', async () => {
    const createdIds = ['pkg-a', 'pkg-b']
    const { tx, reviewCreate } = createTx()
    reviewCreate
      .mockResolvedValueOnce({ id: createdIds[0] })
      .mockResolvedValueOnce({ id: createdIds[1] })

    const ids = await projectPendingReviewPackages(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      sourceActionId: 'action-first',
      reviewPackages: [reviewPackage, reviewPackage],
    })

    expect(ids).toEqual(createdIds)
    expect(reviewCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ itemIdentity: 'item:0' }),
    })
    expect(reviewCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ itemIdentity: 'item:1' }),
    })
  })

  it('replays the same item identity without merging a sibling that shares the proposal hash', async () => {
    const existing = {
      id: 'pkg-item-0',
      sourceActionId: 'action-first',
      candidates: [{ fieldKey: 'name' }],
      itemIdentity: 'item:0',
    }
    const { tx, reviewCreate } = createTx({ existing })

    const replayed = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-later',
      itemIdentity: 'item:0',
    })
    expect(replayed).toBe('pkg-item-0')
    expect(reviewCreate).not.toHaveBeenCalled()

    const { tx: siblingTx, reviewCreate: siblingCreate } = createTx()
    const sibling = await projectPendingReviewPackage(siblingTx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-first',
      itemIdentity: 'item:1',
    })
    expect(sibling).toBe('pkg-new')
    expect(siblingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemIdentity: 'item:1' }),
    })
  })

  it('projects collaboration packages onto an existing departure without a creation draft', async () => {
    const { tx, reviewCreate } = createTx()
    tx.agentTask.findFirst.mockResolvedValue({
      id: 'task-collab',
      type: 'departure_collaboration',
      departure: {
        id: 'departure-1',
        departureNo: 'AB001',
        name: '川西团',
        status: 'editing',
      },
      departureCreationTask: null,
    })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-collab',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-first',
    })

    expect(id).toBe('pkg-new')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetKind: 'departure',
        targetId: 'departure-1',
        itemIdentity: 'item:0',
      }),
    })
  })
})
