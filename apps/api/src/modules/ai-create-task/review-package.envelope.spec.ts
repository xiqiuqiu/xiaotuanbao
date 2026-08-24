import { reviewProposalHash } from './review-package.envelope'

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

describe('reviewProposalHash', () => {
  it('hashes the versioned payload independently of key order', () => {
    const reversed = {
      candidates: payload.candidates,
      confirmationUnit: payload.confirmationUnit,
    }
    expect(reviewProposalHash(reversed)).toBe(reviewProposalHash(payload))
    expect(reviewProposalHash(payload)).toHaveLength(64)
    expect(reviewProposalHash({ ...payload, confirmationUnit: 'other' })).not.toBe(
      reviewProposalHash(payload),
    )
  })
})
