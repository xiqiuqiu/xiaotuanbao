import { createProposeInitialFinanceReviewTool } from './propose-initial-finance-review.tool'
import { runWithAssistRequestContext } from './assist-request-context'
const input = { objectVersion: 2, confirmationUnit: 'source_order_receivable' as const, candidates: [{
  fieldKey: 'sourceOrderId' as const, proposedValue: 'order-1', clarity: 'clear' as const,
  evidence: [{ kind: 'user_message' as const, sequence: 2, excerpt: '继续提交应收' }],
}] }
const config = { apiBaseUrl: 'http://api.local', serviceSecret: 'secret', modelApiKey: 'test' }
describe('initial finance proposal tool', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })
  it('posts only the chosen source using task-bound identity and preserves a rejected proposal', async () => {
    const rejected = { status: 'rejected', errors: [{ candidateIndex: 0, evidenceIndex: 0, code: 'INVALID_FORMAT', message: '证据无效' }] }
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: rejected }) })
    const tool = createProposeInitialFinanceReviewTool(config)
    await expect(runWithAssistRequestContext({ taskId: 'task-1', runId: 'run-1', delegationToken: 'deleg-1' },
      () => tool.execute?.({ ...input, taskId: 'spoofed' } as never, {} as never))).resolves.toEqual(rejected)
    expect(global.fetch).toHaveBeenCalledWith('http://api.local/api/ai-tools/v1/propose-initial-finance-review-package', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer deleg-1', 'X-Agent-Service-Key': 'secret' }),
    }))
    expect(JSON.parse(jest.mocked(global.fetch).mock.calls[0]![1]!.body as string)).toEqual({ ...input, taskId: 'task-1', runId: 'run-1' })
  })
  it('rejects an incomplete payable selection before HTTP', async () => {
    global.fetch = jest.fn()
    await expect(createProposeInitialFinanceReviewTool(config).execute?.({ ...input, confirmationUnit: 'resource_payable' } as never, {} as never))
      .rejects.toMatchObject({ code: 'INVALID_FORMAT' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
