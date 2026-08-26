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
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

describe('createSubmitReviewPackageTool', () => {
  beforeEach(() => {
    mockSubmit.mockReset()
    mockSubmit.mockResolvedValue({
      status: 'accepted',
      objectVersion: 2,
      confirmationUnit: 'basic_info_draft',
      candidates: modelInput.candidates,
      normalizedProposal: {
        schemaVersion: 1,
        normalizationVersion: 'unicode-nfc-whitespace-v1',
        policyVersion: 'evidence-authenticity-v1',
        candidates: [{ candidateIndex: 0, candidateId: 'name', proposedValue: '八月川西团', evidenceIds: ['e1'] }],
        evidenceCatalog: [],
      },
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
    const jsonSchema = standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' })
    expect(jsonSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          candidates: expect.objectContaining({
            items: expect.objectContaining({
              oneOf: expect.arrayContaining([
                expect.objectContaining({
                  properties: expect.objectContaining({
                    fieldKey: expect.objectContaining({ const: 'expectedGuestCountHint' }),
                    proposedValue: expect.objectContaining({ type: 'integer' }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    )
  })

  it('rejects a textual guest count at the model-facing schema boundary', () => {
    const tool = createSubmitReviewPackageTool(toolConfig)
    const modelFacingSchema = tool.inputSchema as unknown as {
      safeParse: (input: unknown) => { success: boolean }
    }

    expect(
      modelFacingSchema.safeParse({
        objectVersion: 1,
        candidates: [
          {
            fieldKey: 'expectedGuestCountHint',
            proposedValue: '约12人',
            clarity: 'needs_confirmation',
            evidence: [{ kind: 'user_message', sequence: 1, excerpt: '预计人数大概12个人' }],
          },
        ],
      }).success,
    ).toBe(false)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('keeps contract validation as a defense-in-depth guard', async () => {
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
                  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫八月川西团' }],
                },
                {
                  fieldKey: 'name',
                  proposedValue: '八月川西团备选',
                  clarity: 'needs_confirmation',
                  evidence: [{ kind: 'user_message', sequence: 1, excerpt: '也可以用备选团名' }],
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

  it('tells the model to keep one routeName when a daily report has two possible routes', async () => {
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
                  fieldKey: 'routeName',
                  proposedValue: '天吐喀伊10日',
                  clarity: 'needs_confirmation',
                  evidence: [
                    {
                      kind: 'material_region',
                      materialId: 'material-1',
                      parseResultVersion: 1,
                      pageNumber: 1,
                      excerpt: '2026年7月21日天吐喀伊10日日报表',
                    },
                  ],
                },
                {
                  fieldKey: 'routeName',
                  proposedValue: '喀伊8日',
                  clarity: 'needs_confirmation',
                  evidence: [
                    {
                      kind: 'material_region',
                      materialId: 'material-1',
                      parseResultVersion: 1,
                      pageNumber: 1,
                      excerpt: '2026年7月21日喀伊8日日报表（司机周雪豹，导游周超凡）',
                    },
                  ],
                },
              ],
            } as never,
            {} as never,
          ),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_FORMAT',
      message: expect.stringContaining('每个字段最多一条候选'),
    })
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})
