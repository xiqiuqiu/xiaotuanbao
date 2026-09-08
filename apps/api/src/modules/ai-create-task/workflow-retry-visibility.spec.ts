import { AiWorkflowProcessor } from './ai-workflow.processor'
describe('retry visibility', () => {
  it('persists and publishes retry reason while retaining failed attempt diagnostics', async () => {
    const event = { id: 'retry-event' }
    const tx = { aiAgentAttempt: { updateMany: jest.fn() }, aiWorkflowJob: { update: jest.fn() } }
    const conversationService = { appendEvent: jest.fn().mockResolvedValue(event), publish: jest.fn() }
    const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
      prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx), aiConversationEvent: { findUnique: jest.fn().mockResolvedValue(event) } },
      conversationService, ownsClaimedJob: jest.fn().mockResolvedValue(true), workflowLog: jest.fn(),
    })
    const result = { kind: 'failed', error: { code: 'MODEL_TIMEOUT', message: 'timeout', retryable: true }, diagnostic: { usageSource: 'missing', latencyMs: 120000, toolSteps: [{ stepId: '1', toolName: 'getTaskContext', status: 'succeeded' }], modelSteps: [] } }
    await processor.scheduleRetry({ id: 'job-1', type: 'agent_batch', attemptCount: 1, organizationId: 'org-1', conversationId: 'chat-1', inputBatchId: 'batch-1' }, 'MODEL_TIMEOUT', 'attempt-1', result)
    expect(conversationService.appendEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ payload: expect.objectContaining({ reason: 'retry_scheduled', errorCode: 'MODEL_TIMEOUT', retryAttempt: 1 }) }))
    expect(conversationService.publish).toHaveBeenCalledWith('chat-1', event)
    expect(tx.aiAgentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: 'MODEL_TIMEOUT', latencyMs: 120000, toolSteps: result.diagnostic.toolSteps }) }))
  })
})
