import { proposeDepartureResourceReviewPackage } from './propose-departure-resource-review.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createProposeDepartureResourceReviewTool } from './propose-departure-resource-review.tool'

jest.mock('./propose-departure-resource-review.client', () => ({
  proposeDepartureResourceReviewPackage: jest.fn(),
}))

const mockSubmit = proposeDepartureResourceReviewPackage as jest.MockedFunction<
  typeof proposeDepartureResourceReviewPackage
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
      fieldKey: 'resourceKind' as const,
      proposedValue: 'insurance' as const,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '全程保险' }],
    },
    {
      fieldKey: 'supplierId' as const,
      proposedValue: 'sup-1',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '平安' }],
    },
    {
      fieldKey: 'title' as const,
      proposedValue: '全程旅行保险',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '全程保险' }],
    },
    {
      fieldKey: 'amountCents' as const,
      proposedValue: 120000,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '1200元' }],
    },
    {
      fieldKey: 'notes' as const,
      proposedValue: '覆盖 4月2日至4月6日',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '4月2日至4月6日' }],
    },
  ],
}

describe('createProposeDepartureResourceReviewTool', () => {
  beforeEach(() => {
    mockSubmit.mockReset()
    mockSubmit.mockResolvedValue({
      status: 'accepted',
      objectVersion: 1_700_000_000_000,
      confirmationUnit: 'departure_resource',
      payloadSchema: 'departure.departure_resource@v1',
      candidates: modelInput.candidates,
      normalizedProposal: {
        schemaVersion: 1,
        normalizationVersion: 'unicode-nfc-whitespace-v1',
        policyVersion: 'evidence-authenticity-v1',
        candidates: [
          { candidateIndex: 0, candidateId: 'resourceKind', proposedValue: 'insurance', evidenceIds: ['e1'] },
        ],
        evidenceCatalog: [],
      },
    })
  })

  it('sends dual identity plus departure-resource candidates, not model-supplied task ids', async () => {
    const tool = createProposeDepartureResourceReviewTool(toolConfig)

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
        confirmationUnit: 'departure_resource',
        candidates: modelInput.candidates,
      },
    )
  })

  it('forwards paired revision identity and rejects incomplete metadata', async () => {
    const tool = createProposeDepartureResourceReviewTool(toolConfig)
    const revision = { reviewPackageId: 'review-1', expectedPackageVersion: 2 }
    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () => tool.execute?.({ ...modelInput, ...revision }, {} as never),
    )
    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(revision))
    mockSubmit.mockClear()
    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({ ...modelInput, reviewPackageId: 'review-1' }, {} as never),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FORMAT' })
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})
