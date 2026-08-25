import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  departureReviewProposalHash,
  reviewProposalHash,
} from './review-package.envelope'
import { toStoredCandidates } from './review-package.mapper'

const payload = {
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

const CANONICAL_NAME_PROPOSAL_HASH =
  '8b04b880c0534a6608670bba3c2c4245275b7c6eb2e3eb128ad7d82b9452cfdc'

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

  it('hashes confirmationUnit plus stripped candidates, not stored candidates text', () => {
    const stored = toStoredCandidates(payload.candidates)
    const naiveStoredTextHash = createHash('sha256')
      .update(JSON.stringify(stored))
      .digest('hex')
    const reconstructed = reviewProposalHash({
      confirmationUnit: payload.confirmationUnit,
      candidates: stored.map((candidate) => ({
        fieldKey: candidate.fieldKey,
        proposedValue: candidate.proposedValue,
        clarity: candidate.clarity,
        evidence: candidate.evidence,
      })),
    })

    expect(departureReviewProposalHash({ ...payload, objectVersion: 1 })).toBe(
      CANONICAL_NAME_PROPOSAL_HASH,
    )
    expect(reconstructed).toBe(CANONICAL_NAME_PROPOSAL_HASH)
    expect(naiveStoredTextHash).not.toBe(CANONICAL_NAME_PROPOSAL_HASH)
    expect(naiveStoredTextHash).toHaveLength(64)
  })
})

describe('proposal_hash backfill', () => {
  it('recomputes migrated hashes from the canonical envelope instead of candidates::text', () => {
    const migrationsDir = join(__dirname, '../../../prisma/migrations')
    const assignments: string[] = []
    for (const name of readdirSync(migrationsDir).sort()) {
      const sqlPath = join(migrationsDir, name, 'migration.sql')
      let sql: string
      try {
        sql = readFileSync(sqlPath, 'utf8')
      } catch {
        continue
      }
      for (const match of sql.matchAll(/SET\s+"proposal_hash"\s*=[\s\S]*?(?=\nWHERE|\nCREATE|\nALTER|;)/gi)) {
        assignments.push(match[0])
      }
    }
    const last = assignments.at(-1) ?? ''
    expect(last).toContain('confirmationUnit')
    expect(last).toContain('review_canonical_json')
    expect(last).not.toMatch(/sha256\(convert_to\("candidates"::text/)
  })
})
