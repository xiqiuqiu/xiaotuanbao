import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { submitReviewPackage } from './submit-review-package.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createSubmitReviewPackageTool } from './submit-review-package.tool'

jest.mock('./submit-review-package.client', () => ({
  submitReviewPackage: jest.fn(),
}))

const mockSubmit = submitReviewPackage as jest.MockedFunction<typeof submitReviewPackage>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

const modelInput = {
  objectVersion: 2,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, excerpt: '团名叫八月川西团' }],
    },
  ],
}

describe('createSubmitReviewPackageTool', () => {
  beforeEach(() => {
    mockSubmit.mockReset()
    mockSubmit.mockResolvedValue({
      reviewPackageId: 'pkg-1',
      status: 'pending',
      objectVersion: 2,
      fieldKeys: ['name'],
    })
  })

  it('sends dual identity plus model candidates, not model-supplied task ids', async () => {
    const tool = createSubmitReviewPackageTool(toolConfig)

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        tool.execute?.(
          { ...modelInput, taskId: 'model-supplied', runId: 'model-supplied' } as never,
          {} as never,
        ),
    )

    expect(mockSubmit).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        objectVersion: 2,
        confirmationUnit: 'basic_info_draft',
        candidates: modelInput.candidates,
      },
    )
  })

  it('uses a Zod v4 inputSchema so Mastra skips the broken zod-to-json-schema.default path', () => {
    const tool = createSubmitReviewPackageTool(toolConfig)
    expect(tool.inputSchema).toBeDefined()
    expect('_zod' in tool.inputSchema!).toBe(true)
    expect(() =>
      standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' }),
    ).not.toThrow()
  })

  it('rejects candidates that pass the model schema but fail the contract', async () => {
    const tool = createSubmitReviewPackageTool(toolConfig)

    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () =>
          tool.execute?.(
            {
              objectVersion: 1,
              candidates: [
                {
                  fieldKey: 'name',
                  proposedValue: '八月川西团',
                  clarity: 'clear',
                  evidence: [{ kind: 'user_message' }],
                },
              ],
            } as never,
            {} as never,
          ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FORMAT' })
    expect(AiCollaborationError.fromCode('INVALID_FORMAT').retryable).toBe(false)
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})
