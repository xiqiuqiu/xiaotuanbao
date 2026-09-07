import type { SubmitReviewPackageInput } from '@xiaotuanbao/ai-contracts'
import { submitReviewPackage } from './submit-review-package.client'

const options = {
  apiBaseUrl: 'http://api.local/',
  serviceSecret: 'secret',
  delegationToken: 'deleg-1',
}

const input: SubmitReviewPackageInput = {
  taskId: 'task-1',
  runId: 'run-1',
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '八月团',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '八月团' }],
    },
  ],
}

const rejected = {
  status: 'rejected' as const,
  errors: [
    {
      candidateIndex: 0,
      evidenceIndex: 0,
      code: 'INVALID_FORMAT',
      message: '候选不完整',
    },
  ],
}

describe('submitReviewPackage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts to propose-review-package with dual identity headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: rejected }),
    })

    const result = await submitReviewPackage(options, input)

    expect(result).toEqual(rejected)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/propose-review-package',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Agent-Service-Key': 'secret',
          Authorization: 'Bearer deleg-1',
        }),
      }),
    )
  })

  it('maps HTTP 403 to PERMISSION_DENIED', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => null,
    })

    await expect(submitReviewPackage(options, input)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    })
  })
})
