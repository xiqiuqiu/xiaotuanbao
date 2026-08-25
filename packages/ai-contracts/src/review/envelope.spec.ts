import {
  DEPARTURE_REVIEW_TARGET_KIND,
  canonicalizeReviewValue,
  isTargetVersionStale,
  reviewConflictChangeSummary,
  reviewDecisionIdentitySchema,
  reviewPackageEnvelopeSchema,
  reviewProposalIdentitySchema,
  sameReviewProposalIdentity,
} from './envelope'

const payload = {
  confirmationUnit: 'basic_info_draft',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '八月川西团',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

const HASH = 'a'.repeat(64)

describe('generic Review Package envelope', () => {
  it('canonicalizes the versioned payload independently of key order', () => {
    const reversed = {
      candidates: payload.candidates,
      confirmationUnit: payload.confirmationUnit,
    }
    expect(canonicalizeReviewValue(reversed)).toEqual(canonicalizeReviewValue(payload))
    expect(canonicalizeReviewValue({ ...payload, confirmationUnit: 'other' })).not.toEqual(
      canonicalizeReviewValue(payload),
    )
  })

  it('treats proposal identity as inputBatch + capability version + target + hash', () => {
    const identity = reviewProposalIdentitySchema.parse({
      inputBatchId: 'batch-a',
      capabilityVersion: 1,
      targetKind: DEPARTURE_REVIEW_TARGET_KIND,
      targetId: 'draft-1',
      proposalHash: HASH,
    })
    expect(
      sameReviewProposalIdentity(identity, {
        ...identity,
        inputBatchId: 'batch-b',
      }),
    ).toBe(false)
  })

  it('treats any target version change as stale without field-level merge', () => {
    expect(isTargetVersionStale(1, 1)).toBe(false)
    expect(isTargetVersionStale(1, 2)).toBe(true)
    expect(
      reviewConflictChangeSummary({
        baseVersion: 1,
        currentVersion: 2,
        baseline: { name: '旧团名', notes: '备注' },
        current: { name: '新团名', notes: '备注已改' },
      }),
    ).toEqual({
      baseVersion: 1,
      currentVersion: 2,
      changedFieldKeys: ['name'],
    })
  })

  it('records confirm identity as package + review version + decision command', () => {
    expect(
      reviewDecisionIdentitySchema.parse({
        reviewPackageId: 'pkg-1',
        reviewVersion: 1,
        decisionCommandId: 'cmd-1',
        extra: true,
      }),
    ).toEqual({
      reviewPackageId: 'pkg-1',
      reviewVersion: 1,
      decisionCommandId: 'cmd-1',
    })
  })

  it('requires conversation, batch, action, capability and target on the envelope', () => {
    const parsed = reviewPackageEnvelopeSchema.parse({
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      attemptId: null,
      sourceActionId: 'action-1',
      capabilityKey: 'departure.review-package.propose',
      capabilityVersion: 1,
      targetKind: DEPARTURE_REVIEW_TARGET_KIND,
      targetId: 'draft-1',
      baseVersion: 1,
      proposalHash: HASH,
      status: 'pending',
    })
    expect(parsed.status).toBe('pending')
    expect(() =>
      reviewPackageEnvelopeSchema.parse({ ...parsed, status: 'conflict' }),
    ).not.toThrow()
    expect(() =>
      reviewPackageEnvelopeSchema.parse({ ...parsed, status: 'cancelled' }),
    ).not.toThrow()
  })
})
