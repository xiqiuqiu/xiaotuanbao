import { createHash } from 'node:crypto'
import {
  AI_EVIDENCE_NORMALIZATION_VERSION,
  AI_EVIDENCE_POLICY_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  normalizedEvidenceProposalSchemaV1,
  type EvidenceCandidateProposalV1,
  type EvidenceProposalV1,
  type MaterialParsePageV1,
  type NormalizedEvidenceProposalV1,
  type NormalizedEvidenceV1,
} from '@xiaotuanbao/ai-contracts'

export type EvidenceValidationErrorCode =
  | 'SOURCE_NOT_FROZEN'
  | 'SOURCE_NOT_FOUND'
  | 'ATTEMPT_MANIFEST_MISMATCH'
  | 'MATERIAL_NOT_PINNED'
  | 'PAGE_NOT_FOUND'
  | 'MATERIAL_REGION_NOT_READ'
  | 'EXCERPT_NOT_FOUND'
  | 'EXCERPT_AMBIGUOUS'
  | 'UNKNOWN_RULE'
  | 'RULE_VERSION_MISMATCH'
  | 'RULE_EVALUATION_FAILED'
  | 'DERIVATION_INPUT_INVALID'
  | 'NORMALIZED_PROPOSAL_TOO_LARGE'
  | 'DERIVATION_MISMATCH'

export interface EvidenceAuthority {
  attempt: { id: string; contextManifestId: string }
  contextManifest: {
    id: string
    conversationId: string
    inputBatchId: string
    eventSequences: number[]
    materialVersions: Array<{ materialId: string; parseResultVersion: number }>
    sourceVersions?: Array<{ sourceId: string; parseVersion: number }>
    excerptDigests: Array<{
      fragmentId: string
      materialId: string
      parseResultVersion: number
      pageNumber: number
      normalizedTextRange: { start: number; end: number }
      sha256: string
    }>
  }
  events: Array<{
    id: string
    conversationId: string
    sequence: number
    kind: 'user_message'
    text: string
  }>
  materials: Array<{
    inputBatchId: string
    conversationId?: string
    materialId: string
    parseResultVersion: number
    pages: MaterialParsePageV1[]
    eligibleRegions: Array<{
      pageNumber: number
      normalizedTextRange: { start: number; end: number }
      contentSha256: string
      source:
        | { kind: 'initial_manifest_excerpt'; fragmentId: string }
        | {
            kind: 'directed_read'
            readReceiptId: string
            actionId: string
            attemptId: string
            contextManifestId: string
            status: 'succeeded'
            evidenceEligible: true
          }
    }>
  }>
}

export interface EvidenceSystemRule {
  version: number
  derive(input: {
    inputEvidence: readonly NormalizedEvidenceV1[]
  }): string | number
}

export type EvidenceSystemRuleRegistry = Readonly<Record<string, EvidenceSystemRule>>

export type EvidenceValidationResult =
  | { success: true; normalizedProposal: NormalizedEvidenceProposalV1 }
  | {
      success: false
      errors: Array<{
        candidateIndex: number
        evidenceIndex: number
        code: EvidenceValidationErrorCode
        message: string
      }>
    }

type EvidenceProposalItem = EvidenceCandidateProposalV1['evidence'][number]
type ValidationError = Extract<EvidenceValidationResult, { success: false }>['errors'][number]

export function normalizeEvidenceText(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+/gu, ' ').trim()
}

export function validateEvidenceProposal(input: {
  proposal: EvidenceProposalV1
  authority: EvidenceAuthority
  systemRules: EvidenceSystemRuleRegistry
}): EvidenceValidationResult {
  if (input.authority.attempt.contextManifestId !== input.authority.contextManifest.id) {
    return {
      success: false,
      errors: [
        {
          candidateIndex: 0,
          evidenceIndex: 0,
          code: 'ATTEMPT_MANIFEST_MISMATCH',
          message: 'Attempt 与 Context Manifest 不匹配',
        },
      ],
    }
  }
  const errors: ValidationError[] = []
  const candidateEvidence: NormalizedEvidenceV1[][] = []

  input.proposal.candidates.forEach((candidate, candidateIndex) => {
    const normalizedByIndex = new Map<number, NormalizedEvidenceV1>()
    candidate.evidence.forEach((evidence, evidenceIndex) => {
      if (evidence.kind === 'system_derivation') return
      const result = resolveSourceEvidence(evidence, input.authority)
      if ('code' in result) {
        errors.push({ candidateIndex, evidenceIndex, ...result })
      } else {
        normalizedByIndex.set(evidenceIndex, result)
      }
    })
    candidate.evidence.forEach((evidence, evidenceIndex) => {
      if (evidence.kind !== 'system_derivation') return
      const inputEvidence = evidence.locator.inputEvidenceIndexes.flatMap((index) => {
        const resolved = normalizedByIndex.get(index)
        return resolved ? [resolved] : []
      })
      if (inputEvidence.length !== evidence.locator.inputEvidenceIndexes.length) {
        errors.push({
          candidateIndex,
          evidenceIndex,
          code: 'DERIVATION_INPUT_INVALID',
          message: '系统推导引用了未通过验证的输入证据',
        })
        return
      }
      const result = resolveSystemDerivation(
        evidence,
        candidate,
        inputEvidence,
        input.authority,
        input.systemRules,
      )
      if ('code' in result) {
        errors.push({ candidateIndex, evidenceIndex, ...result })
      } else {
        normalizedByIndex.set(evidenceIndex, result)
      }
    })
    candidateEvidence.push(
      [...normalizedByIndex.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, evidence]) => evidence),
    )
  })

  if (errors.length > 0) {
    return { success: false, errors }
  }

  const evidenceById = new Map<string, NormalizedEvidenceV1>()
  for (const evidence of candidateEvidence.flat()) {
    evidenceById.set(evidence.evidenceId, evidence)
  }
  const parsedProposal = normalizedEvidenceProposalSchemaV1.safeParse({
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    normalizationVersion: AI_EVIDENCE_NORMALIZATION_VERSION,
    policyVersion: AI_EVIDENCE_POLICY_VERSION,
    candidates: input.proposal.candidates.map((candidate, candidateIndex) => ({
      candidateIndex,
      candidateId: candidate.candidateId,
      proposedValue: candidate.proposedValue,
      evidenceIds: candidateEvidence[candidateIndex]!.map((evidence) => evidence.evidenceId),
    })),
    evidenceCatalog: [...evidenceById.values()],
  })
  if (!parsedProposal.success) {
    return {
      success: false,
      errors: [
        {
          candidateIndex: 0,
          evidenceIndex: 0,
          code: 'NORMALIZED_PROPOSAL_TOO_LARGE',
          message: '规范化证据记录超过服务端大小上限',
        },
      ],
    }
  }
  return { success: true, normalizedProposal: parsedProposal.data }
}

function resolveSourceEvidence(
  evidence: Exclude<EvidenceProposalItem, { kind: 'system_derivation' }>,
  authority: EvidenceAuthority,
): NormalizedEvidenceV1 | Pick<ValidationError, 'code' | 'message'> {
  if (evidence.kind === 'user_message') {
    return resolveUserMessage(evidence, authority)
  }
  return resolveMaterialRegion(evidence, authority)
}

function resolveUserMessage(
  evidence: Extract<EvidenceProposalItem, { kind: 'user_message' }>,
  authority: EvidenceAuthority,
): NormalizedEvidenceV1 | Pick<ValidationError, 'code' | 'message'> {
  if (!authority.contextManifest.eventSequences.includes(evidence.locator.sequence)) {
    return validationError('SOURCE_NOT_FROZEN', '消息序号不属于本次冻结上下文')
  }
  const event = authority.events.find(
    (item) =>
      item.id === evidence.locator.eventId &&
      item.sequence === evidence.locator.sequence &&
      item.conversationId === authority.contextManifest.conversationId,
  )
  if (!event) {
    return validationError('SOURCE_NOT_FOUND', '找不到定位的冻结 User 消息')
  }
  const match = exactUniqueMatch(event.text, evidence.excerpt)
  if ('code' in match) return match

  const excerpt = normalizedExcerpt(evidence.excerpt)
  return withEvidenceId({
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    attemptId: authority.attempt.id,
    contextManifestId: authority.contextManifest.id,
    kind: 'user_message',
    locator: {
      conversationId: event.conversationId,
      eventId: event.id,
      sequence: event.sequence,
      normalizedTextRange: match,
    },
    excerpt,
    sourceSha256: sha256(event.text),
  })
}

function resolveMaterialRegion(
  evidence: Extract<EvidenceProposalItem, { kind: 'material_region' }>,
  authority: EvidenceAuthority,
): NormalizedEvidenceV1 | Pick<ValidationError, 'code' | 'message'> {
  const sourceId = evidence.locator.sourceId ?? evidence.locator.materialId
  const pinned = authority.contextManifest.materialVersions.some(
    (item) =>
      item.materialId === sourceId &&
      item.parseResultVersion === evidence.locator.parseResultVersion,
  )
  const catalogued = authority.contextManifest.sourceVersions?.some(
    (item) =>
      item.sourceId === sourceId && item.parseVersion === evidence.locator.parseResultVersion,
  )
  const material = authority.materials.find(
    (item) =>
      item.materialId === sourceId &&
      item.parseResultVersion === evidence.locator.parseResultVersion &&
      (item.inputBatchId === authority.contextManifest.inputBatchId ||
        item.conversationId === authority.contextManifest.conversationId),
  )
  if ((!pinned && !catalogued) || !material) {
    return validationError('MATERIAL_NOT_PINNED', '资料或解析版本不属于当前会话固定来源')
  }
  const page = material.pages.find((item) => item.pageNumber === evidence.locator.pageNumber)
  if (!page) {
    return validationError('PAGE_NOT_FOUND', '固定解析版本中不存在该页')
  }
  const match = exactUniqueMatch(page.text, evidence.excerpt)
  if ('code' in match) return match

  const normalizedPageText = normalizeEvidenceText(page.text)
  const eligibleRegion = material.eligibleRegions.find((region) => {
    if (
      region.pageNumber !== page.pageNumber ||
      match.start < region.normalizedTextRange.start ||
      match.end > region.normalizedTextRange.end
    ) {
      return false
    }
    const eligibleText = normalizedPageText.slice(
      region.normalizedTextRange.start,
      region.normalizedTextRange.end,
    )
    if (sha256(eligibleText) !== region.contentSha256) {
      return false
    }
    if (region.source.kind === 'initial_manifest_excerpt') {
      const initialSource = region.source
      return authority.contextManifest.excerptDigests.some(
        (digest) =>
          digest.materialId === material.materialId &&
          digest.parseResultVersion === material.parseResultVersion &&
          digest.fragmentId === initialSource.fragmentId &&
          digest.pageNumber === region.pageNumber &&
          digest.normalizedTextRange.start === region.normalizedTextRange.start &&
          digest.normalizedTextRange.end === region.normalizedTextRange.end &&
          digest.sha256 === region.contentSha256,
      )
    }
    return (
      region.source.attemptId === authority.attempt.id &&
      region.source.contextManifestId === authority.contextManifest.id &&
      region.source.status === 'succeeded' &&
      region.source.evidenceEligible === true &&
      Boolean(region.source.actionId)
    )
  })
  if (!eligibleRegion) {
    return validationError(
      'MATERIAL_REGION_NOT_READ',
      '资料区域既不属于初始 Manifest 摘录，也没有本次 Attempt 的成功读取回执',
    )
  }

  const matchedLines = linesOverlappingMatch(page, match)
  if (matchedLines.length === 0) {
    return validationError('EXCERPT_NOT_FOUND', '摘录无法定位到规范化解析行')
  }
  const regions = matchedLines.flatMap((line) =>
    line.geometry ? [{ lineNumber: line.lineNumber, ...line.geometry }] : [],
  )
  const matchedLineNumbers = new Set(matchedLines.map((line) => line.lineNumber))
  const qualityLines = page.source === 'ocr'
    ? page.lines
        .filter((line) => matchedLineNumbers.has(line.lineNumber))
        .map((line) => ({ lineNumber: line.lineNumber, score: line.ocrQuality.score }))
    : []
  const excerpt = normalizedExcerpt(evidence.excerpt)
  return withEvidenceId({
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    attemptId: authority.attempt.id,
    contextManifestId: authority.contextManifest.id,
    kind: 'material_region',
    locator: {
      inputBatchId: material.inputBatchId,
      materialId: material.materialId,
      parseResultVersion: material.parseResultVersion,
      pageNumber: page.pageNumber,
      source: page.source,
      normalizedTextRange: match,
      lineRange: {
        start: matchedLines[0]!.lineNumber,
        end: matchedLines[matchedLines.length - 1]!.lineNumber,
      },
      regions,
      evidenceSource:
        eligibleRegion.source.kind === 'initial_manifest_excerpt'
          ? {
              kind: 'initial_manifest_excerpt' as const,
              fragmentId: eligibleRegion.source.fragmentId,
            }
          : {
              kind: 'directed_read' as const,
              readReceiptId: eligibleRegion.source.readReceiptId,
              actionId: eligibleRegion.source.actionId,
            },
    },
    excerpt,
    sourceSha256: sha256(page.text),
    ...(qualityLines.length > 0
      ? { recognitionQuality: { signal: 'rapidocr_line_score' as const, lines: qualityLines } }
      : {}),
  })
}

function resolveSystemDerivation(
  evidence: Extract<EvidenceProposalItem, { kind: 'system_derivation' }>,
  candidate: EvidenceCandidateProposalV1,
  inputEvidence: readonly NormalizedEvidenceV1[],
  authority: EvidenceAuthority,
  systemRules: EvidenceSystemRuleRegistry,
): NormalizedEvidenceV1 | Pick<ValidationError, 'code' | 'message'> {
  const rule = systemRules[evidence.locator.ruleId]
  if (!rule) {
    return validationError('UNKNOWN_RULE', '系统推导规则未登记')
  }
  if (rule.version !== evidence.locator.ruleVersion) {
    return validationError('RULE_VERSION_MISMATCH', '系统推导规则版本不一致')
  }
  let derived: string | number
  try {
    derived = rule.derive({ inputEvidence })
  } catch {
    return validationError('RULE_EVALUATION_FAILED', '系统推导规则重算失败')
  }
  if (derived !== candidate.proposedValue) {
    return validationError('DERIVATION_MISMATCH', '系统重算结果与候选值不一致')
  }
  const resultText = normalizeEvidenceText(String(derived))
  const excerpt = normalizedExcerpt(resultText)
  return withEvidenceId({
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    attemptId: authority.attempt.id,
    contextManifestId: authority.contextManifest.id,
    kind: 'system_derivation',
    locator: {
      ruleId: evidence.locator.ruleId,
      ruleVersion: evidence.locator.ruleVersion,
      inputEvidenceIds: inputEvidence.map((item) => item.evidenceId),
    },
    excerpt,
    sourceSha256: sha256(
      `${evidence.locator.ruleId}:${rule.version}:${inputEvidence.map((item) => item.evidenceId).join(',')}:${resultText}`,
    ),
  })
}

function exactUniqueMatch(
  source: string,
  claimedExcerpt: string,
): { start: number; end: number } | Pick<ValidationError, 'code' | 'message'> {
  const normalizedSource = normalizeEvidenceText(source)
  const normalizedClaim = normalizeEvidenceText(claimedExcerpt)
  const starts: number[] = []
  let cursor = normalizedSource.indexOf(normalizedClaim)
  while (cursor >= 0) {
    starts.push(cursor)
    cursor = normalizedSource.indexOf(normalizedClaim, cursor + 1)
  }
  if (starts.length === 0) {
    return validationError('EXCERPT_NOT_FOUND', '摘录与权威来源不一致')
  }
  if (starts.length > 1) {
    return validationError('EXCERPT_AMBIGUOUS', '摘录在权威来源中重复出现，无法唯一定位')
  }
  return { start: starts[0]!, end: starts[0]! + normalizedClaim.length }
}

function linesOverlappingMatch(
  page: MaterialParsePageV1,
  match: { start: number; end: number },
): MaterialParsePageV1['lines'] {
  const normalizedPage = normalizeEvidenceText(page.text)
  let searchFrom = 0
  return page.lines.filter((line) => {
    const lineText = normalizeEvidenceText(line.text)
    const start = normalizedPage.indexOf(lineText, searchFrom)
    if (start < 0) return false
    const end = start + lineText.length
    searchFrom = end
    return start < match.end && end > match.start
  })
}

function normalizedExcerpt(value: string): { text: string; sha256: string } {
  const text = normalizeEvidenceText(value)
  return { text, sha256: sha256(text) }
}

function withEvidenceId<T extends Omit<NormalizedEvidenceV1, 'evidenceId'>>(
  evidence: T,
): T & { evidenceId: string } {
  return { ...evidence, evidenceId: sha256(stableStringify(evidence)) }
}

function validationError(
  code: EvidenceValidationErrorCode,
  message: string,
): Pick<ValidationError, 'code' | 'message'> {
  return { code, message }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
