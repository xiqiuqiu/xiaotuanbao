import type { SubmitDepartureResourceReviewInput } from '@xiaotuanbao/ai-contracts'
import { proposeDepartureResourceReviewPackage } from './propose-departure-resource-review.client'

const options = {
  apiBaseUrl: 'http://api.local/',
  serviceSecret: 'secret',
  delegationToken: 'deleg-1',
}

const input: SubmitDepartureResourceReviewInput = {
  taskId: 'task-1',
  runId: 'run-1',
  objectVersion: 2,
  confirmationUnit: 'departure_resource',
  candidates: [
    {
      fieldKey: 'title',
      proposedValue: '全程旅行保险',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '全程保险 1200 元' }],
    },
  ],
}

const rejected = {
  status: 'rejected' as const,
  errors: [
    {
      candidateIndex: 0,
      evidenceIndex: 0,
      code: 'DEPARTURE_RESOURCE_INVALID',
      message: '约定总价必须为正整数分',
    },
  ],
}

describe('proposeDepartureResourceReviewPackage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts to propose-departure-resource-review-package with dual identity headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: rejected }),
    })

    const result = await proposeDepartureResourceReviewPackage(options, input)

    expect(result).toEqual(rejected)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/propose-departure-resource-review-package',
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

    await expect(proposeDepartureResourceReviewPackage(options, input)).rejects.toMatchObject({
      code: 'AGENT_UNAVAILABLE',
    })
  })
})
