import { AiReviewPackageStatus } from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import {
  departureObjectVersion,
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
  itemIdentity: 'item:0',
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
  uniqueOnFirstCreateOnly?: boolean
  raced?: { id: string; sourceActionId: string | null; candidates: unknown; itemIdentity?: string } | null
  departureUpdatedAt?: Date
}) {
  const packages: Array<{
    id: string
    sourceActionId: string | null
    itemIdentity: string
    candidates: unknown
  }> = options?.existing
    ? [
        {
          id: options.existing.id,
          sourceActionId: options.existing.sourceActionId,
          itemIdentity: options.existing.itemIdentity ?? 'item:0',
          candidates: options.existing.candidates,
        },
      ]
    : []
  let createCalls = 0
  const created = { id: 'pkg-new-0' }
  const draftUpdate = jest.fn()
  const reviewCreate = jest.fn().mockImplementation(async ({ data }: { data: { itemIdentity: string; sourceAction: { connect: { id: string } } } }) => {
    createCalls += 1
    if (options?.uniqueOnCreate || (options?.uniqueOnFirstCreateOnly && createCalls === 1)) {
      const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      throw error
    }
    const row = {
      id: `pkg-new-${packages.filter((pkg) => pkg.id.startsWith('pkg-new-')).length}`,
      sourceActionId: data.sourceAction.connect.id,
      itemIdentity: data.itemIdentity,
      candidates: reviewPackage.candidates,
    }
    packages.push(row)
    return { id: row.id }
  })
  const reviewFindFirst = jest.fn().mockImplementation(
    ({ where }: { where?: { sourceActionId?: string; inputBatchId?: string; itemIdentity?: string } }) => {
      if (options?.uniqueOnCreate || options?.uniqueOnFirstCreateOnly) {
        if (where?.sourceActionId && where.itemIdentity) {
          const stored = packages.find(
            (pkg) => pkg.sourceActionId === where.sourceActionId && pkg.itemIdentity === where.itemIdentity,
          )
          return Promise.resolve(stored ?? null)
        }
        if (where?.sourceActionId) {
          return Promise.resolve(null)
        }
        if (where?.itemIdentity) {
          const stored = packages.find((pkg) => pkg.itemIdentity === where.itemIdentity)
          if (stored) {
            return Promise.resolve(stored)
          }
          const racedRow = options.raced === undefined ? racedPackage : options.raced
          if (
            racedRow &&
            (racedRow.itemIdentity ?? 'item:0') === where.itemIdentity &&
            reviewCreate.mock.calls.length > 0
          ) {
            return Promise.resolve(racedRow)
          }
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      }
      if (where?.sourceActionId) {
        const found = packages.find(
          (pkg) =>
            pkg.sourceActionId === where.sourceActionId &&
            (where.itemIdentity == null || pkg.itemIdentity === where.itemIdentity),
        )
        return Promise.resolve(found ?? null)
      }
      if (where?.itemIdentity) {
        const found = packages.find((pkg) => pkg.itemIdentity === where.itemIdentity)
        return Promise.resolve(found ?? null)
      }
      return Promise.resolve(null)
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
      findMany: jest.fn().mockImplementation(() => {
        const identities = packages.map((pkg) => ({ itemIdentity: pkg.itemIdentity }))
        if (
          (options?.uniqueOnCreate || options?.uniqueOnFirstCreateOnly) &&
          reviewCreate.mock.calls.length > 0 &&
          options.raced !== null
        ) {
          const racedIdentity = (options.raced ?? racedPackage).itemIdentity ?? 'item:0'
          if (!identities.some((row) => row.itemIdentity === racedIdentity)) {
            identities.push({ itemIdentity: racedIdentity })
          }
        }
        return Promise.resolve(identities)
      }),
      count: jest.fn().mockResolvedValue(options?.existingCount ?? packages.length),
    },
  }
  return { tx, reviewCreate, draftUpdate, created, packages }
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

    expect(id).toBe('pkg-new-0')
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

    expect(id).toBe('pkg-new-0')
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

    expect(id).toBe('pkg-new-0')
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

  it('replays the existing package when concurrent creates race the same action identity', async () => {
    const { tx, reviewCreate } = createTx({
      uniqueOnCreate: true,
      raced: {
        id: 'pkg-raced',
        sourceActionId: 'action-later',
        candidates: [{ fieldKey: 'name' }],
        itemIdentity: 'item:0',
      },
    })

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

  it('does not reuse another action package when concurrent creates race the item identity', async () => {
    const { tx, reviewCreate } = createTx({ uniqueOnFirstCreateOnly: true })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-new-0')
    expect(reviewCreate).toHaveBeenCalledTimes(2)
    expect(reviewCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ itemIdentity: 'item:1' }),
    })
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
    const { tx, reviewCreate } = createTx()

    const ids = await projectPendingReviewPackages(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      sourceActionId: 'action-first',
      reviewPackages: [reviewPackage, reviewPackage],
    })

    expect(ids).toEqual(['pkg-new-0', 'pkg-new-1'])
    expect(reviewCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ itemIdentity: 'item:0' }),
    })
    expect(reviewCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ itemIdentity: 'item:1' }),
    })
  })

  it('does not reuse another action package when count-based identity is stale', async () => {
    const { tx, reviewCreate } = createTx({
      existing: {
        id: 'pkg-existing',
        sourceActionId: 'action-first',
        candidates: [{ fieldKey: 'name' }],
        itemIdentity: 'item:0',
      },
      existingCount: 0,
    })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage,
      sourceActionId: 'action-later',
    })

    expect(id).toBe('pkg-new-0')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemIdentity: 'item:1',
        sourceAction: { connect: { id: 'action-later' } },
      }),
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
      sourceActionId: 'action-first',
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
    expect(sibling).toBe('pkg-new-0')
    expect(siblingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemIdentity: 'item:1' }),
    })
  })

  it('projects collaboration packages onto an existing departure without a creation draft', async () => {
    const updatedAt = new Date('2026-01-15T08:00:00.000Z')
    const { tx, reviewCreate } = createTx()
    tx.agentTask.findFirst.mockResolvedValue({
      id: 'task-collab',
      type: 'departure_collaboration',
      departure: {
        id: 'departure-1',
        departureNo: 'AB001',
        name: '川西团',
        status: 'editing',
        updatedAt,
      },
      departureCreationTask: null,
    })

    const id = await projectPendingReviewPackage(tx as never, {
      organizationId: 'org-1',
      taskId: 'task-collab',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      reviewPackage: { ...reviewPackage, objectVersion: updatedAt.getTime() },
      sourceActionId: 'action-first',
    })

    expect(id).toBe('pkg-new-0')
    expect(reviewCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetKind: 'departure',
        targetId: 'departure-1',
        itemIdentity: 'item:0',
        baseObjectVersion: updatedAt.getTime(),
      }),
    })
  })

  it('does not project a collaboration package when the departure object version is stale', async () => {
    const { tx, reviewCreate } = createTx()
    tx.agentTask.findFirst.mockResolvedValue({
      id: 'task-collab',
      type: 'departure_collaboration',
      departure: {
        id: 'departure-1',
        departureNo: 'AB001',
        name: '川西团',
        status: 'editing',
        updatedAt: new Date('2026-01-15T08:00:00.000Z'),
      },
      departureCreationTask: null,
    })

    await expect(
      projectPendingReviewPackage(tx as never, {
        organizationId: 'org-1',
        taskId: 'task-collab',
        conversationId: 'conv-1',
        inputBatchId: 'batch-1',
        reviewPackage,
        sourceActionId: 'action-first',
      }),
    ).rejects.toThrow('VERSION_CONFLICT')
    expect(reviewCreate).not.toHaveBeenCalled()
  })
})


describe('stable pending item revisions', () => {
  function setup() {
    const candidate = { fieldKey: 'amountCents', proposedValue: 20000, clarity: 'clear' as const,
      status: 'pending' as const, evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '200元' }] }
    const pkg = {
      id: 'stable', status: 'pending', version: 2, task: { ownerUserId: 'owner' },
      confirmationUnit: 'segment_resource', payloadSchema: 'departure.segment_resource@v1',
      targetKind: 'departure', targetId: 'departure-1', baseObjectVersion: 1,
      candidates: [candidate], baselineSnapshot: {}, userCorrections: { amountCents: 23000, notes: '人工备注' },
    }
    const tx = { aiReviewPackage: { findFirst: jest.fn().mockResolvedValue(pkg), updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
      aiReviewRecord: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } }
    const params = { organizationId: 'org-1', taskId: 'task-1', conversationId: 'conv-1', inputBatchId: 'new-batch',
      sourceActionId: 'new-action', target: { kind: 'departure', id: 'departure-1', version: 1, snapshot: {} },
      reviewPackage: { objectVersion: 1, confirmationUnit: 'segment_resource', reviewPackageId: 'stable', expectedPackageVersion: 2,
        candidates: [{ ...candidate, proposedValue: 26000 }] } }
    return { tx, pkg, params }
  }

  it('revises the same item with CAS, preserves human values and records effective changes', async () => {
    const { tx, params, pkg } = setup()
    expect(await projectPendingReviewPackage(tx as never, params)).toBe('stable')
    const data = tx.aiReviewPackage.updateMany.mock.calls[0]![0].data
    expect(tx.aiReviewPackage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 'stable', organizationId: 'org-1', taskId: 'task-1', conversationId: 'conv-1',
      confirmationUnit: 'segment_resource', targetKind: 'departure', targetId: 'departure-1',
    } }))
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stable', organizationId: 'org-1', status: 'pending', version: 2 },
    }))
    expect(data).toMatchObject({ version: { increment: 1 }, sourceActionId: 'new-action',
      userCorrections: pkg.userCorrections,
      baselineSnapshot: { reviewConflicts: [{ fieldKey: 'amountCents', proposedValue: 26000, userCorrectedValue: 23000 }] },
      candidates: [{ fieldKey: 'amountCents', proposedValue: 26000 }],
    })
    expect(data).not.toHaveProperty('inputBatchId')
    expect(data).not.toHaveProperty('itemIdentity')
    expect(data.candidates).toHaveLength(1)
    expect(tx.aiReviewRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'revise', packageVersion: 3,
      beforeSnapshot: { amountCents: 23000, notes: '人工备注' },
      afterSnapshot: { amountCents: 23000, notes: '人工备注' },
    }) })
    expect(tx.aiReviewPackage.create).not.toHaveBeenCalled()
  })

  it('retains unresolved conflicts and clears them when the new proposal agrees with the human value', async () => {
    const { tx, pkg, params } = setup()
    pkg.candidates[0]!.proposedValue = 26000
    pkg.baselineSnapshot = { reviewConflicts: [{ fieldKey: 'amountCents', proposedValue: 26000, userCorrectedValue: 23000 }] }
    await projectPendingReviewPackage(tx as never, params)
    expect(tx.aiReviewPackage.updateMany.mock.calls[0]![0].data.baselineSnapshot.reviewConflicts).toHaveLength(1)
    params.reviewPackage.candidates[0]!.proposedValue = 23000
    await projectPendingReviewPackage(tx as never, params)
    expect(tx.aiReviewPackage.updateMany.mock.calls[1]![0].data.baselineSnapshot.reviewConflicts).toEqual([])
  })

  it('rejects stale versions, resolved items and a failed CAS without writing revision history', async () => {
    const { tx, pkg, params } = setup()
    pkg.version = 3
    await expect(projectPendingReviewPackage(tx as never, params)).rejects.toThrow('VERSION_CONFLICT')
    pkg.version = 2
    pkg.status = 'confirmed'
    await expect(projectPendingReviewPackage(tx as never, params)).rejects.toThrow('VERSION_CONFLICT')
    pkg.status = 'pending'
    tx.aiReviewPackage.updateMany.mockResolvedValue({ count: 0 })
    await expect(projectPendingReviewPackage(tx as never, params)).rejects.toThrow('VERSION_CONFLICT')
    expect(tx.aiReviewRecord.create).not.toHaveBeenCalled()
  })

  it('replays a revision action even after the package version has advanced', async () => {
    const { tx, pkg, params } = setup()
    pkg.version = 5
    tx.aiReviewRecord.findFirst.mockResolvedValue({ id: 'revision-record' })
    expect(await projectPendingReviewPackage(tx as never, params)).toBe('stable')
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiReviewRecord.create).not.toHaveBeenCalled()
  })
})

describe('departureObjectVersion', () => {
  it('encodes updatedAt as a millisecond timestamp beyond INT4', () => {
    const updatedAt = new Date(1_785_733_521_449)
    expect(departureObjectVersion(updatedAt)).toBe(1_785_733_521_449)
    expect(departureObjectVersion(updatedAt)).toBeGreaterThan(2_147_483_647)
  })
})
