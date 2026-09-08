import { postAiTool } from './post-ai-tool'
import { runWithAssistRequestContext } from './assist-request-context'
import { createProposeSourceOrderReviewTool } from './propose-source-order-review.tool'

jest.mock('./post-ai-tool', () => ({ postAiTool: jest.fn() }))
const post = jest.mocked(postAiTool)
const config = { apiBaseUrl: 'http://api.local', serviceSecret: 'secret', modelApiKey: 'test' }
const candidate = {
  fieldKey: 'adultGuestCount',
  proposedValue: 2,
  clarity: 'clear',
  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '两位成人' }],
}

it('keeps missing fields absent, binds trusted IDs and rejects invalid field values before HTTP', async () => {
  post.mockResolvedValue({
    status: 'rejected',
    errors: [{ candidateIndex: 0, evidenceIndex: 0, code: 'TEST', message: 'test' }],
  })
  const tool = createProposeSourceOrderReviewTool(config)
  const execute = (candidates: unknown[]) =>
    runWithAssistRequestContext(
      { delegationToken: 'delegation', taskId: 'trusted-task', runId: 'trusted-run' },
      () =>
        tool.execute?.(
          {
            objectVersion: 1780000000000,
            candidates,
            taskId: 'untrusted',
            runId: 'untrusted',
          } as never,
          {} as never,
        ),
    )
  await execute([candidate])
  expect(post).toHaveBeenCalledWith(
    {
      apiBaseUrl: config.apiBaseUrl,
      serviceSecret: config.serviceSecret,
      delegationToken: 'delegation',
    },
    '/api/ai-tools/v1/propose-source-order-review-package',
    {
      objectVersion: 1780000000000,
      confirmationUnit: 'source_order_create',
      candidates: [candidate],
      taskId: 'trusted-task',
      runId: 'trusted-run',
    },
  )
  await expect(execute([{ ...candidate, proposedValue: '2' }])).rejects.toThrow()
  await expect(
    execute([{ ...candidate, fieldKey: 'discountType', proposedValue: 'percentage' }]),
  ).rejects.toThrow()
  expect(post).toHaveBeenCalledTimes(1)
})
