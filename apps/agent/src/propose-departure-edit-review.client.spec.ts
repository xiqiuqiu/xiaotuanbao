import { proposeDepartureEditReviewPackage } from './propose-departure-edit-review.client'
import type { SubmitDepartureEditReviewInput } from '@xiaotuanbao/ai-contracts'

const input: SubmitDepartureEditReviewInput = {
  taskId: 'task-1', runId: 'run-1', objectVersion: 2,
  confirmationUnit: 'itinerary_segment_update',
  candidates: [
    { fieldKey: 'itinerarySegmentId', proposedValue: 'segment-1', clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: '更改行程备注' }] },
    { fieldKey: 'notes', proposedValue: null, clarity: 'clear', evidence: [{ kind: 'user_message', sequence: 1, excerpt: '清空备注' }] },
  ],
}
const options = { apiBaseUrl: 'http://api.local/', serviceSecret: 'secret', delegationToken: 'deleg-1' }

describe('proposeDepartureEditReviewPackage', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('posts to the edit endpoint using both service and delegation identity', async () => {
    const rejected = { status: 'rejected', errors: [{ candidateIndex: 0, evidenceIndex: 0, code: 'INVALID_FORMAT', message: '目标已变化' }] }
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: rejected }) })
    await expect(proposeDepartureEditReviewPackage(options, input)).resolves.toEqual(rejected)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/propose-departure-edit-review-package',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input),
        headers: expect.objectContaining({ 'X-Agent-Service-Key': 'secret', Authorization: 'Bearer deleg-1' }),
      }),
    )
  })

  it('maps network failures to the collaboration error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'))
    await expect(proposeDepartureEditReviewPackage(options, input)).rejects.toMatchObject({ code: 'AGENT_UNAVAILABLE' })
  })
})
