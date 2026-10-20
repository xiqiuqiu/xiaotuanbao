import { createHash } from 'node:crypto'
import { ReviewCollaborationService } from './review-collaboration.service'
import { readInitialFinanceSources } from './initial-finance-sources'
const version = Number.parseInt(createHash('sha256').update('{}').digest('hex').slice(0, 13), 16) + 1
const evidence = [{ kind: 'user_message', sequence: 1, excerpt: '继续提交应收' }]
const proposal = { objectVersion: version, confirmationUnit: 'source_order_receivable', candidates: [{ fieldKey: 'sourceOrderId', proposedValue: 'source-1', clarity: 'clear', evidence }] }
const caller = { organizationId: 'org-1', userId: 'user-1', taskId: 'task-1', runId: 'attempt-1', attemptId: 'attempt-1', conversationId: 'conv-1', inputBatchId: 'batch-1', grantedCapabilities: [{ key: 'departure.initial-finance.propose', version: 1 }] }
function setup() {
  const source = { afterSnapshot: { objectKind: 'source_order', objectId: 'source-1' }, package: { payloadSchema: 'source_order.create@v1' } }
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ snapshot: '{}' }]),
    agentTask: { findFirst: jest.fn().mockResolvedValue({ departureId: 'departure-1' }) },
    aiAgentAttempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', organizationId: 'org-1', conversationId: 'conv-1', inputBatchId: 'batch-1', contextManifestId: 'manifest-1' }) },
    aiContextManifest: { findUnique: jest.fn().mockResolvedValue({ id: 'manifest-1', attemptId: 'attempt-1', inputBatchId: 'batch-1', organizationId: 'org-1', conversationId: 'conv-1', eventSequences: [1], materialVersions: [], sourceVersions: [] }) },
    aiConversationEvent: { findMany: jest.fn().mockResolvedValue([{ id: 'event-1', conversationId: 'conv-1', sequence: 1, kind: 'user_message', payload: { text: '继续提交应收' } }]) },
    aiReviewRecord: { findMany: jest.fn().mockResolvedValue([source]) },
    aiReviewPackage: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: jest.fn() },
  }
  const generation = { previewInitialReceivables: jest.fn().mockResolvedValue({ order: { departureId: 'departure-1' } }), previewInitialPayable: jest.fn() }
  const prisma = { ...tx, $transaction: jest.fn(async (cb) => cb(tx)) }
  const permissions = jest.fn().mockResolvedValue(['/departure'])
  const service = new ReviewCollaborationService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, { getPermissionKeysForUser: permissions } as never, {} as never, generation as never, {} as never)
  return { service, prisma, tx, generation, permissions, source }
}
it('prevalidates only: no review package or formal finance write occurs before Worker commit', async () => {
  const { service, tx, generation } = setup()
  const result = await service.proposeInitialFinanceReviewForAgent(caller as never, { ...proposal, taskId: caller.taskId, runId: caller.runId })
  expect(result.status).toBe('accepted')
  expect(generation.previewInitialReceivables).toHaveBeenCalledWith('org-1', 'source-1', tx)
  expect(tx.aiReviewPackage.create).not.toHaveBeenCalled()
  expect(tx.aiReviewPackage.update).not.toHaveBeenCalled()
})
it.each(['segment_resource', 'departure_resource'] as const)('previews the selected %s payable without accepting model money or widening sources', async (sourceType) => {
  const { service, tx, generation } = setup()
  tx.aiConversationEvent.findMany.mockResolvedValue([{ id: 'event-1', conversationId: 'conv-1', sequence: 1, kind: 'user_message', payload: { text: '继续提交应付' } }] as never)
  tx.aiReviewRecord.findMany.mockResolvedValue([{ afterSnapshot: { objectKind: sourceType, objectId: 'resource-1' }, package: {
    payloadSchema: sourceType === 'segment_resource' ? 'departure.segment_resource@v1' : 'departure.departure_resource@v1',
  } }] as never)
  generation.previewInitialPayable.mockResolvedValue({ resourceKind: sourceType === 'segment_resource' ? 'segment' : 'departure',
    resource: { segment: { departure: { id: 'departure-1' } }, departure: { id: 'departure-1' } } } as never)
  const input = { ...proposal, taskId: caller.taskId, runId: caller.runId, confirmationUnit: 'resource_payable', candidates: ['sourceType', 'sourceId'].map((fieldKey) => ({
    fieldKey, proposedValue: fieldKey === 'sourceType' ? sourceType : 'resource-1', clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: '继续提交应付' }],
  })) }
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, input)).resolves.toMatchObject({ status: 'accepted' })
  expect(generation.previewInitialPayable).toHaveBeenCalledWith('org-1', { sourceType, sourceId: 'resource-1' }, tx)
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, { ...input, amountCents: 1 })).rejects.toThrow()
  expect(tx.aiReviewPackage.create).not.toHaveBeenCalled()
})
it('rejects stale facts before previewing or preparing anything', async () => {
  const { service, generation } = setup()
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, { ...proposal, objectVersion: 1, taskId: caller.taskId, runId: caller.runId })).rejects.toThrow()
  expect(generation.previewInitialReceivables).not.toHaveBeenCalled()
})
it('rejects invalid user evidence and non-session sources without persisting a package', async () => {
  const { service, tx, generation } = setup()
  const input = { ...proposal, taskId: caller.taskId, runId: caller.runId }
  tx.aiReviewRecord.findMany.mockResolvedValue([])
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, input)).rejects.toThrow('本会话成功创建')
  expect(generation.previewInitialReceivables).not.toHaveBeenCalled()
  const invalid = { ...input, candidates: [{ ...proposal.candidates[0], evidence: [{ ...evidence[0], excerpt: '伪造内容' }] }] }
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, invalid)).resolves.toMatchObject({ status: 'rejected' })
})
it('rechecks task identity, capability and current permissions before preview', async () => {
  const { service, permissions, generation } = setup()
  const input = { ...proposal, taskId: caller.taskId, runId: caller.runId }
  await expect(service.proposeInitialFinanceReviewForAgent({ ...caller, grantedCapabilities: [] } as never, input)).rejects.toThrow()
  permissions.mockResolvedValue([])
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, input)).rejects.toThrow('无权')
  expect(generation.previewInitialReceivables).not.toHaveBeenCalled()
})
it('accepts paired revision identity only for the same pending source and package version', async () => {
  const { service, tx, generation } = setup()
  tx.aiReviewPackage.findFirst.mockResolvedValue({ id: 'finance-1', baselineSnapshot: { sourceOrderId: 'source-1' } } as never)
  const input = { ...proposal, taskId: caller.taskId, runId: caller.runId, reviewPackageId: 'finance-1', expectedPackageVersion: 3 }
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, input)).resolves.toMatchObject({ status: 'accepted', reviewPackageId: 'finance-1', expectedPackageVersion: 3 })
  expect(tx.aiReviewPackage.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
    id: 'finance-1', taskId: 'task-1', conversationId: 'conv-1', status: 'pending', version: 3,
    targetId: 'departure-1', payloadSchema: 'source_order.receivable@v1',
  }) })
  generation.previewInitialReceivables.mockClear()
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, { ...input,
    candidates: [{ ...proposal.candidates[0], proposedValue: 'source-2' }],
  })).rejects.toThrow('不能更换客源')
  tx.aiReviewPackage.findFirst.mockResolvedValue(null)
  await expect(service.proposeInitialFinanceReviewForAgent(caller as never, input)).rejects.toThrow()
  expect(generation.previewInitialReceivables).not.toHaveBeenCalled()
})
it('projects through the existing transaction preparation once and replays the action', async () => {
  const { service, tx } = setup()
  const prepare = jest.spyOn(service, 'prepareSourceOrderReceivableReviewInTx').mockResolvedValue({ id: 'finance-1', status: 'pending' } as never)
  const context = { ...caller, departureId: 'departure-1', sourceActionId: 'action-1' }
  await expect(service.projectInitialFinanceReviewInTx(tx as never, context, proposal)).resolves.toBe('finance-1')
  expect(prepare).toHaveBeenCalledWith(tx, 'org-1', 'user-1', 'departure-1', { conversationId: 'conv-1', sourceOrderId: 'source-1' }, context)
  tx.aiReviewPackage.findFirst.mockResolvedValue({ id: 'finance-1' } as never)
  await expect(service.projectInitialFinanceReviewInTx(tx as never, context, proposal)).resolves.toBe('finance-1')
  expect(prepare).toHaveBeenCalledTimes(1)
})
it('publishes only successful creation refs from this conversation and departure', async () => {
  const { tx, source } = setup()
  tx.aiReviewRecord.findMany.mockResolvedValue([source, source, { afterSnapshot: { objectKind: 'other', objectId: 'unrelated' }, package: source.package }])
  await expect(readInitialFinanceSources(tx as never, 'org-1', 'conv-1', 'departure-1')).resolves.toEqual([{ sourceType: 'source_order', sourceId: 'source-1' }])
  expect(tx.aiReviewRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', action: 'confirm', writeResult: 'success',
    package: expect.objectContaining({ conversationId: 'conv-1', targetKind: 'departure', targetId: 'departure-1', status: 'confirmed' }),
  }) }))
})
it('does not refresh or overwrite an existing agreement without paired revision identity', async () => {
  const { service, tx } = setup()
  tx.aiReviewPackage.findMany.mockResolvedValue([{ id: 'existing', baselineSnapshot: { sourceOrderId: 'source-1' } }] as never)
  const prepare = jest.spyOn(service, 'prepareSourceOrderReceivableReviewInTx')
  await expect(service.projectInitialFinanceReviewInTx(tx as never, { ...caller, departureId: 'departure-1', sourceActionId: 'action-2' }, proposal)).resolves.toBe('existing')
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.aiReviewPackage.update).not.toHaveBeenCalled()
})
