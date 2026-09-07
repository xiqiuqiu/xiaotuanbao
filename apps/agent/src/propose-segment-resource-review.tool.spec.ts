import { proposeSegmentResourceReviewPackage } from './propose-segment-resource-review.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createProposeSegmentResourceReviewTool } from './propose-segment-resource-review.tool'

jest.mock('./propose-segment-resource-review.client', () => ({
  proposeSegmentResourceReviewPackage: jest.fn(),
}))

const mockSubmit = proposeSegmentResourceReviewPackage as jest.MockedFunction<
  typeof proposeSegmentResourceReviewPackage
>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

const modelInput = {
  objectVersion: 1_700_000_000_000,
  candidates: [
    {
      fieldKey: 'itinerarySegmentId' as const,
      proposedValue: 'seg-1',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '4月2日住宿' }],
    },
    {
      fieldKey: 'resourceKind' as const,
      proposedValue: 'hotel' as const,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '住宿' }],
    },
    {
      fieldKey: 'supplierId' as const,
      proposedValue: 'sup-1',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '川西酒店' }],
    },
    {
      fieldKey: 'title' as const,
      proposedValue: '4月2日住宿',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '4月2日住宿' }],
    },
    {
      fieldKey: 'amountCents' as const,
      proposedValue: 128000,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '1280元' }],
    },
  ],
}

describe('createProposeSegmentResourceReviewTool', () => {
  beforeEach(() => {
    mockSubmit.mockReset()
    mockSubmit.mockResolvedValue({
      status: 'accepted',
      objectVersion: 1_700_000_000_000,
      confirmationUnit: 'segment_resource',
      payloadSchema: 'departure.segment_resource@v1',
      candidates: modelInput.candidates,
      normalizedProposal: {
        schemaVersion: 1,
        normalizationVersion: 'unicode-nfc-whitespace-v1',
        policyVersion: 'evidence-authenticity-v1',
        candidates: [
          { candidateIndex: 0, candidateId: 'itinerarySegmentId', proposedValue: 'seg-1', evidenceIds: ['e1'] },
        ],
        evidenceCatalog: [],
      },
    })
  })

  it('sends dual identity plus segment-resource candidates, not model-supplied task ids', async () => {
    const tool = createProposeSegmentResourceReviewTool(toolConfig)

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
        objectVersion: 1_700_000_000_000,
        confirmationUnit: 'segment_resource',
        candidates: modelInput.candidates,
      },
    )
  })
})
