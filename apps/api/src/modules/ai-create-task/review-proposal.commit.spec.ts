import { validateReviewProposal } from './review-proposal.validator'
import { requireValidReviewProposal, ReviewProposalRejectedError } from './review-proposal.commit'

const authority = {
  attempt: { id: 'attempt-1', contextManifestId: 'manifest-1' },
  contextManifest: {
    id: 'manifest-1',
    conversationId: 'conversation-1',
    inputBatchId: 'batch-1',
    eventSequences: [1],
    materialVersions: [],
    excerptDigests: [],
  },
  events: [
    {
      id: 'event-1',
      conversationId: 'conversation-1',
      sequence: 1,
      kind: 'user_message' as const,
      text: '团名叫九月川西团',
    },
  ],
  materials: [],
}

const validProposal = {
  objectVersion: 1,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '九月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '九月川西团' }],
    },
  ],
}

describe('requireValidReviewProposal', () => {
  it('returns the same validator result used by prevalidation', () => {
    const expected = validateReviewProposal({ proposal: validProposal, authority })
    const actual = requireValidReviewProposal({ proposal: validProposal, authority })

    expect(expected.success).toBe(true)
    expect(actual).toEqual(expected)
  })

  it('does not treat a false excerpt as a durable review proposal', () => {
    expect(() =>
      requireValidReviewProposal({
        proposal: {
          ...validProposal,
          candidates: [
            {
              fieldKey: 'name',
              proposedValue: '十月川西团',
              clarity: 'clear',
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '十月川西团' }],
            },
          ],
        },
        authority,
      }),
    ).toThrow(ReviewProposalRejectedError)
  })
})
