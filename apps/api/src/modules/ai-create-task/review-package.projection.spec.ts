import { AiReviewPackageStatus } from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { projectPendingReviewPackage, httpPendingReviewDisposition } from './review-package.projection'

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

function createTx(options?: {
  pending?: { id: string; sourceActionId: string | null; inputBatchId: string | null }
  draftVersion?: number
}) {
  const created = { id: 'pkg-new' }
  const draftUpdate = jest.fn()
  const reviewCreate = jest.fn().mockResolvedValue(created)
  const reviewUpdate = jest.fn().mockResolvedValue({ id: options?.pending?.id })
  const tx = {
    aiCreateTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'task-1',
        draft: { version: options?.draftVersion ?? 1, snapshot },
        reviewPackages: options?.pending ? [options.pending] : [],
      }),
    },
    departureCreationDraft: { update: draftUpdate, updateMany: draftUpdate },
    aiReviewPackage: {
      create: reviewCreate,
      update: reviewUpdate,
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }
  return { tx, reviewCreate, reviewUpdate, draftUpdate }
}

describe('projectPendingReviewPackage', () => {
  it('creates a pending package sourced from the first successful write action and does not write the draft', async () => {
    const { tx, reviewCreate, draftUpdate } = createTx()

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      inputBatchId: 'batch-1',
      runId: 'run-1',
      reviewPackage,
      sourceActionId: 'action-first',
    })

    expect(id).toBe('pkg-new')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        taskId: 'task-1',
        runId: 'run-1',
        inputBatchId: 'batch-1',
        status: AiReviewPackageStatus.pending,
        sourceActionId: 'action-first',
        baseObjectVersion: 1,
      }),
    })
    expect(draftUpdate).not.toHaveBeenCalled()
  })

  it('reuses an existing pending package without changing its source action', async () => {
    const pending = { id: 'pkg-existing', sourceActionId: 'action-first', inputBatchId: 'batch-1' }
    const { tx, reviewCreate, reviewUpdate } = createTx({ pending })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      inputBatchId: 'batch-2',
      runId: 'run-2',
      reviewPackage: {
        ...reviewPackage,
        candidates: [
          {
            fieldKey: 'expectedGuestCountHint',
            proposedValue: 20,
            clarity: 'clear',
            evidence: [{ kind: 'user_message', excerpt: '二十人', sequence: 2 }],
          },
        ],
      },
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-existing')
    expect(reviewCreate).not.toHaveBeenCalled()
    expect(reviewUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceActionId: 'action-later' }),
      }),
    )
  })

  it('does not create a package when the draft version does not match', async () => {
    const { tx, reviewCreate } = createTx({ draftVersion: 2 })

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-1',
        inputBatchId: 'batch-1',
        runId: 'run-1',
        reviewPackage,
        sourceActionId: 'action-first',
      }),
    ).rejects.toThrow('VERSION_CONFLICT')

    expect(reviewCreate).not.toHaveBeenCalled()
  })

  it('does not create a package when the source AI action is missing', async () => {
    const { tx, reviewCreate } = createTx()

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-1',
        inputBatchId: 'batch-1',
        runId: 'run-1',
        reviewPackage,
        sourceActionId: '',
      }),
    ).rejects.toThrow('REVIEW_PACKAGE_MISSING_ACTION')

    expect(reviewCreate).not.toHaveBeenCalled()
  })
})

describe('httpPendingReviewDisposition', () => {
  it('creates when there is no pending package', () => {
    expect(httpPendingReviewDisposition(undefined, 'action-1')).toBe('create')
  })

  it('replays the same source action onto the existing pending package', () => {
    expect(
      httpPendingReviewDisposition({ sourceActionId: 'action-1' }, 'action-1'),
    ).toBe('replay')
  })

  it('rejects a later proposal without treating it as a source change', () => {
    expect(
      httpPendingReviewDisposition({ sourceActionId: 'action-first' }, 'action-later'),
    ).toBe('reject')
  })

  it('rejects when an older pending package has no source action', () => {
    expect(httpPendingReviewDisposition({ sourceActionId: null }, 'action-1')).toBe('reject')
  })
})
