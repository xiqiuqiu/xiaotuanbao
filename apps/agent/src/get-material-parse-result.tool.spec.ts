import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { fetchMaterialParseResult } from './get-material-parse-result.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createGetMaterialParseResultTool } from './get-material-parse-result.tool'

jest.mock('./get-material-parse-result.client', () => ({
  fetchMaterialParseResult: jest.fn(),
}))

const mockFetch = fetchMaterialParseResult as jest.MockedFunction<typeof fetchMaterialParseResult>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

describe('createGetMaterialParseResultTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      materialId: 'mat-1',
      status: 'available',
      resultVersion: 1,
      pages: [{ pageNumber: 1, source: 'ocr', text: '八月川西团' }],
    })
  })

  it('calls NestJS with ALS identity and the model materialId', async () => {
    const tool = createGetMaterialParseResultTool(toolConfig)

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () => tool.execute?.({ materialId: 'mat-1' } as never, {} as never),
    )

    expect(mockFetch).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      { taskId: 'task-1', runId: 'run-1', materialId: 'mat-1' },
    )
  })

  it('fails closed when the model key is missing', async () => {
    const tool = createGetMaterialParseResultTool({
      ...toolConfig,
      modelApiKey: '',
    })

    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({ materialId: 'mat-1' } as never, {} as never),
      ),
    ).rejects.toMatchObject({
      code: 'AGENT_UNAVAILABLE',
    })
    expect(AiCollaborationError.fromCode('AGENT_UNAVAILABLE').retryable).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
