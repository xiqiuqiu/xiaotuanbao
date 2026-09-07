import type { SubmitSegmentResourceReviewInput } from '@xiaotuanbao/ai-contracts'
import { proposeSegmentResourceReviewPackage } from './propose-segment-resource-review.client'

const options = {
  apiBaseUrl: 'http://api.local/',
  serviceSecret: 'secret',
  delegationToken: 'deleg-1',
}

const input: SubmitSegmentResourceReviewInput = {
  taskId: 'task-1',
  runId: 'run-1',
  objectVersion: 2,
  confirmationUnit: 'segment_resource',
  candidates: [
    {
      fieldKey: 'title',
      proposedValue: '4月2日住宿',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '4月2日住宿' }],
    },
  ],
}

const rejected = {
  status: 'rejected' as const,
  errors: [
    {
      candidateIndex: 0,
      evidenceIndex: 0,
      code: 'SEGMENT_UNASSIGNED',
      message: '行程段未指定或不属于本团',
    },
  ],
}

describe('proposeSegmentResourceReviewPackage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts to propose-segment-resource-review-package with dual identity headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: rejected }),
    })

    const result = await proposeSegmentResourceReviewPackage(options, input)

    expect(result).toEqual(rejected)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/propose-segment-resource-review-package',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Agent-Service-Key': 'secret',
          Authorization: 'Bearer deleg-1',
        }),
      }),
    )
  })

  it('maps transport failures to AGENT_UNAVAILABLE', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'))

    await expect(proposeSegmentResourceReviewPackage(options, input)).rejects.toMatchObject({
      code: 'AGENT_UNAVAILABLE',
    })
  })
})
