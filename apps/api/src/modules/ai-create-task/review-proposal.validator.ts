import {
  AI_EVIDENCE_CANDIDATE_LIMIT,
  AI_EVIDENCE_PER_CANDIDATE_LIMIT,
  AI_EVIDENCE_PROPOSAL_JSON_MAX_BYTES,
  AI_EVIDENCE_SCHEMA_VERSION,
  type AiReviewCandidateInput,
  type EvidenceProposalV1,
  type NormalizedEvidenceProposalV1,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import {
  validateEvidenceProposal,
  type EvidenceAuthority,
  type EvidenceSystemRuleRegistry,
  type EvidenceValidationErrorCode,
} from './evidence-validator'

export type ReviewProposalErrorCode =
  | EvidenceValidationErrorCode
  | 'CANDIDATE_LIMIT_EXCEEDED'
  | 'EVIDENCE_LIMIT_EXCEEDED'
  | 'PROPOSAL_JSON_TOO_LARGE'

export type ReviewProposalError = {
  candidateIndex: number
  evidenceIndex: number
  code: ReviewProposalErrorCode
  message: string
}

export type ReviewProposalValidationResult =
  | {
      success: true
      normalizedProposal: NormalizedEvidenceProposalV1
      reviewPackage: SubmitReviewPackageModelInput
    }
  | { success: false; errors: ReviewProposalError[] }

const EMPTY_RULES: EvidenceSystemRuleRegistry = {}

export function validateReviewProposal(input: {
  proposal: SubmitReviewPackageModelInput
  authority: EvidenceAuthority
  systemRules?: EvidenceSystemRuleRegistry
}): ReviewProposalValidationResult {
  const limitError = proposalLimitError(input.proposal)
  if (limitError) {
    return { success: false, errors: [limitError] }
  }

  const evidenceProposal = toEvidenceProposal(input.proposal, input.authority)
  const evidenceResult = validateEvidenceProposal({
    proposal: evidenceProposal,
    authority: input.authority,
    systemRules: input.systemRules ?? EMPTY_RULES,
  })
  if (!evidenceResult.success) {
    return evidenceResult
  }
  return {
    success: true,
    normalizedProposal: evidenceResult.normalizedProposal,
    reviewPackage: {
      objectVersion: input.proposal.objectVersion,
      confirmationUnit: input.proposal.confirmationUnit,
      candidates: input.proposal.candidates,
    },
  }
}

function proposalLimitError(proposal: SubmitReviewPackageModelInput): ReviewProposalError | null {
  if (proposal.candidates.length > AI_EVIDENCE_CANDIDATE_LIMIT) {
    return {
      candidateIndex: 0,
      evidenceIndex: 0,
      code: 'CANDIDATE_LIMIT_EXCEEDED',
      message: `审核候选不能超过 ${AI_EVIDENCE_CANDIDATE_LIMIT} 条`,
    }
  }
  const oversizedEvidence = proposal.candidates.findIndex(
    (candidate) => candidate.evidence.length > AI_EVIDENCE_PER_CANDIDATE_LIMIT,
  )
  if (oversizedEvidence >= 0) {
    return {
      candidateIndex: oversizedEvidence,
      evidenceIndex: AI_EVIDENCE_PER_CANDIDATE_LIMIT,
      code: 'EVIDENCE_LIMIT_EXCEEDED',
      message: `单条候选证据不能超过 ${AI_EVIDENCE_PER_CANDIDATE_LIMIT} 条`,
    }
  }
  if (utf8ByteLength(JSON.stringify(proposal)) > AI_EVIDENCE_PROPOSAL_JSON_MAX_BYTES) {
    return {
      candidateIndex: 0,
      evidenceIndex: 0,
      code: 'PROPOSAL_JSON_TOO_LARGE',
      message: '审核提案超过 JSON 大小上限',
    }
  }
  return null
}

function toEvidenceProposal(
  proposal: SubmitReviewPackageModelInput,
  authority: EvidenceAuthority,
): EvidenceProposalV1 {
  return {
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    candidates: proposal.candidates.map((candidate) => ({
      candidateId: candidate.fieldKey,
      proposedValue: candidate.proposedValue,
      evidence: candidate.evidence.map((evidence) => toEvidenceItem(evidence, authority)),
    })),
  }
}

function toEvidenceItem(
  evidence: AiReviewCandidateInput['evidence'][number],
  authority: EvidenceAuthority,
): EvidenceProposalV1['candidates'][number]['evidence'][number] {
  if (evidence.kind === 'user_message') {
    const event =
      evidence.messageId != null
        ? authority.events.find((item) => item.id === evidence.messageId)
        : authority.events.find((item) => item.sequence === evidence.sequence)
    return {
      schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
      kind: 'user_message',
      locator: {
        eventId: event?.id ?? evidence.messageId ?? 'unresolved',
        sequence: evidence.sequence,
      },
      excerpt: evidence.excerpt,
    }
  }
  if (evidence.kind === 'material_region') {
    return {
      schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
      kind: 'material_region',
      locator: {
        materialId: evidence.materialId,
        parseResultVersion: evidence.parseResultVersion,
        pageNumber: evidence.pageNumber,
      },
      excerpt: evidence.excerpt,
    }
  }
  return {
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    kind: 'system_derivation',
    locator: {
      ruleId: evidence.rule,
      ruleVersion: 1,
      inputEvidenceIndexes: [0],
    },
  }
}

function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const codeUnit = text.charCodeAt(i)
    if (codeUnit <= 0x7f) {
      bytes += 1
      continue
    }
    if (codeUnit <= 0x7ff) {
      bytes += 2
      continue
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
        continue
      }
      bytes += 3
      continue
    }
    bytes += 3
  }
  return bytes
}
