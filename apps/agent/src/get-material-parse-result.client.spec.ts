import { fetchMaterialParseResult } from './get-material-parse-result.client'
import type { GetMaterialParseResultOutput } from '@xiaotuanbao/ai-contracts'

describe('fetchMaterialParseResult', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('calls NestJS with dual identity headers and returns pinned pages without bytes', async () => {
    const result: GetMaterialParseResultOutput = {
      materialId: 'mat-1',
      parseResultVersion: 1,
      pageCount: 1,
      truncated: false,
      pages: [{ pageNumber: 1, source: 'ocr', text: '九月川西线' }],
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: result }),
    })

    const parsed = await fetchMaterialParseResult(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
      },
    )

    expect(parsed).toEqual(result)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/get-material-parse-result',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Agent-Service-Key': 'secret',
          Authorization: 'Bearer deleg-1',
        }),
      }),
    )
  })
})
