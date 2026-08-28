import { createHash } from 'node:crypto'
import type { EvidenceProposalV1, MaterialParsePageV1 } from '@xiaotuanbao/ai-contracts'
import { buildSourceIndex, sourceFactToUserMessageEvidence } from '@xiaotuanbao/ai-contracts'
import { validateEvidenceProposal } from './evidence-validator'

const ocrPage = {
    schemaVersion: 1,
    pageNumber: 1,
    source: 'ocr',
    text: '团名：九月川西团\n人数：12 人',
    lines: [
      {
        lineNumber: 1,
        text: '团名：九月川西团',
        geometry: { x: 10, y: 20, width: 160, height: 20, unit: 'pixels' },
        ocrQuality: { signal: 'rapidocr_line_score', score: 0.92 },
      },
      {
        lineNumber: 2,
        text: '人数：12 人',
        geometry: { x: 10, y: 50, width: 120, height: 20, unit: 'pixels' },
        ocrQuality: { signal: 'rapidocr_line_score', score: 0.64 },
      },
    ],
} satisfies MaterialParsePageV1

const pages: MaterialParsePageV1[] = [ocrPage]
const normalizedMaterialText = '团名：九月川西团 人数：12 人'

const authority = {
  attempt: { id: 'attempt-1', contextManifestId: 'manifest-1' },
  contextManifest: {
    id: 'manifest-1',
    conversationId: 'conversation-1',
    inputBatchId: 'batch-1',
    eventSequences: [1, 3],
    materialVersions: [{ materialId: 'material-1', parseResultVersion: 2 }],
    excerptDigests: [
      {
        fragmentId: 'fragment-material-1-v2-p1-0-17',
        materialId: 'material-1',
        parseResultVersion: 2,
        pageNumber: 1,
        normalizedTextRange: { start: 0, end: normalizedMaterialText.length },
        sha256: createHash('sha256').update(normalizedMaterialText).digest('hex'),
      },
    ],
  },
  events: [
    {
      id: 'event-3',
      conversationId: 'conversation-1',
      sequence: 3,
      kind: 'user_message' as const,
      text: '请按 Cafe\u0301   川西线\r\n创建 九月川西团',
    },
  ],
  materials: [
    {
      inputBatchId: 'batch-1',
      materialId: 'material-1',
      parseResultVersion: 2,
      pages,
      eligibleRegions: [
        {
          pageNumber: 1,
          normalizedTextRange: { start: 0, end: normalizedMaterialText.length },
          contentSha256: createHash('sha256').update(normalizedMaterialText).digest('hex'),
          source: {
            kind: 'initial_manifest_excerpt' as const,
            fragmentId: 'fragment-material-1-v2-p1-0-17',
          },
        },
      ],
    },
  ],
}

function proposal(evidence: EvidenceProposalV1['candidates'][number]['evidence']): EvidenceProposalV1 {
  return {
    schemaVersion: 1,
    candidates: [
      {
        candidateId: 'name',
        proposedValue: '九月川西团',
        evidence,
      },
    ],
  }
}

describe('validateEvidenceProposal', () => {
  it('resolves an exact frozen message after conservative normalization', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator: { eventId: 'event-3', sequence: 3 },
          excerpt: 'Café 川西线 创建 九月川西团',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        schemaVersion: 1,
        normalizationVersion: 'unicode-nfc-whitespace-v1',
        candidates: [{ candidateIndex: 0, evidenceIds: [expect.any(String)] }],
        evidenceCatalog: [
          {
            kind: 'user_message',
            locator: {
              conversationId: 'conversation-1',
              eventId: 'event-3',
              sequence: 3,
            },
            excerpt: { text: 'Café 川西线 创建 九月川西团' },
          },
        ],
      },
    })
  })

  it.each([
    ['伪造序号', { eventId: 'event-3', sequence: 99 }, 'SOURCE_NOT_FROZEN'],
    ['伪造消息标识', { eventId: 'event-fake', sequence: 3 }, 'SOURCE_NOT_FOUND'],
  ])('rejects %s', (_label, locator, code) => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator,
          excerpt: '九月川西团',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false, errors: [{ code }] })
  })

  it('rejects an incorrect excerpt without fuzzy or semantic matching', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator: { eventId: 'event-3', sequence: 3 },
          excerpt: '十月川西团',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false, errors: [{ code: 'EXCERPT_NOT_FOUND' }] })
  })

  it('accepts a same-conversation catalogued source that is not pinned to this batch', () => {
    const cataloguedAuthority = {
      ...authority,
      contextManifest: {
        ...authority.contextManifest,
        materialVersions: [{ materialId: 'other-pin', parseResultVersion: 1 }],
        sourceVersions: [{ sourceId: 'material-1', parseVersion: 2 }],
      },
      materials: [
        {
          ...authority.materials[0]!,
          conversationId: 'conversation-1',
        },
      ],
    }
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { sourceId: 'material-1', parseResultVersion: 2, pageNumber: 1 },
          excerpt: '九月川西团 人数：12 人',
        },
      ]),
      authority: cataloguedAuthority,
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        evidenceCatalog: [
          {
            kind: 'material_region',
            locator: {
              materialId: 'material-1',
              parseResultVersion: 2,
              pageNumber: 1,
            },
          },
        ],
      },
    })
  })

  it('accepts sourceId as an alias for a pinned conversation source', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { sourceId: 'material-1', parseResultVersion: 2, pageNumber: 1 },
          excerpt: '九月川西团 人数：12 人',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        evidenceCatalog: [
          {
            kind: 'material_region',
            locator: {
              inputBatchId: 'batch-1',
              materialId: 'material-1',
              parseResultVersion: 2,
              pageNumber: 1,
            },
          },
        ],
      },
    })
  })

  it('normalizes a pinned OCR material locator and keeps raw line quality signals', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { materialId: 'material-1', parseResultVersion: 2, pageNumber: 1 },
          excerpt: '九月川西团 人数：12 人',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        evidenceCatalog: [
          {
            kind: 'material_region',
            locator: {
              inputBatchId: 'batch-1',
              materialId: 'material-1',
              parseResultVersion: 2,
              pageNumber: 1,
              lineRange: { start: 1, end: 2 },
              regions: [
                { lineNumber: 1, x: 10, y: 20 },
                { lineNumber: 2, x: 10, y: 50 },
              ],
            },
            recognitionQuality: {
              signal: 'rapidocr_line_score',
              lines: [
                { lineNumber: 1, score: 0.92 },
                { lineNumber: 2, score: 0.64 },
              ],
            },
          },
        ],
      },
    })
  })

  it.each([
    ['跨批次资料', { ...authority, materials: [{ ...authority.materials[0]!, inputBatchId: 'batch-2' }] }, 2, 'MATERIAL_NOT_PINNED'],
    ['错误解析版本', authority, 3, 'MATERIAL_NOT_PINNED'],
  ])('rejects %s', (_label, changedAuthority, version, code) => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { materialId: 'material-1', parseResultVersion: version, pageNumber: 1 },
          excerpt: '九月川西团',
        },
      ]),
      authority: changedAuthority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false, errors: [{ code }] })
  })

  it('rejects duplicate normalized matches instead of guessing a region', () => {
    const duplicateAuthority = {
      ...authority,
      materials: [
        {
          ...authority.materials[0]!,
          pages: [
            {
              ...ocrPage,
              text: '九月川西团\n九月川西团',
              lines: [ocrPage.lines[0]!, { ...ocrPage.lines[0]!, lineNumber: 2 }],
            },
          ],
        },
      ],
    }
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { materialId: 'material-1', parseResultVersion: 2, pageNumber: 1 },
          excerpt: '九月川西团',
        },
      ]),
      authority: duplicateAuthority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false, errors: [{ code: 'EXCERPT_AMBIGUOUS' }] })
  })

  it('recomputes registered rules and rejects unknown rules', () => {
    const sourceEvidence = {
      schemaVersion: 1 as const,
      kind: 'user_message' as const,
      locator: { eventId: 'event-3', sequence: 3 },
      excerpt: '九月川西团',
    }
    const known = validateEvidenceProposal({
      proposal: proposal([
        sourceEvidence,
        {
          schemaVersion: 1,
          kind: 'system_derivation',
          locator: { ruleId: 'trip.name', ruleVersion: 1, inputEvidenceIndexes: [0] },
        },
      ]),
      authority,
      systemRules: {
        'trip.name': {
          version: 1,
          derive: ({ inputEvidence }) => inputEvidence[0]!.excerpt.text,
        },
      },
    })
    const unknown = validateEvidenceProposal({
      proposal: proposal([
        sourceEvidence,
        {
          schemaVersion: 1,
          kind: 'system_derivation',
          locator: { ruleId: 'trip.unknown', ruleVersion: 1, inputEvidenceIndexes: [0] },
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(known).toMatchObject({ success: true })
    expect(unknown).toMatchObject({ success: false, errors: [{ code: 'UNKNOWN_RULE' }] })
  })

  it('fails the complete proposal when any evidence is invalid', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator: { eventId: 'event-3', sequence: 3 },
          excerpt: '九月川西团',
        },
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator: { eventId: 'event-3', sequence: 3 },
          excerpt: '不存在的摘录',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false })
    expect(result).not.toHaveProperty('normalizedProposal')
  })

  it('deduplicates permanent evidence without losing candidate associations', () => {
    const sharedEvidence = {
      schemaVersion: 1 as const,
      kind: 'user_message' as const,
      locator: { eventId: 'event-3', sequence: 3 },
      excerpt: '九月川西团',
    }
    const result = validateEvidenceProposal({
      proposal: {
        schemaVersion: 1,
        candidates: [
          {
            candidateId: 'name',
            proposedValue: '九月川西团',
            evidence: [sharedEvidence],
          },
          {
            candidateId: 'routeName',
            proposedValue: '川西线',
            evidence: [sharedEvidence],
          },
        ],
      },
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        candidates: [{ evidenceIds: [expect.any(String)] }, { evidenceIds: [expect.any(String)] }],
        evidenceCatalog: [expect.objectContaining({ kind: 'user_message' })],
      },
    })
    if (result.success) {
      expect(result.normalizedProposal.candidates[0]!.evidenceIds).toEqual(
        result.normalizedProposal.candidates[1]!.evidenceIds,
      )
    }
  })

  it('rejects a page absent from the fixed parse result', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { materialId: 'material-1', parseResultVersion: 2, pageNumber: 9 },
          excerpt: '九月川西团',
        },
      ]),
      authority,
      systemRules: {},
    })

    expect(result).toMatchObject({ success: false, errors: [{ code: 'PAGE_NOT_FOUND' }] })
  })

  it('rejects a pinned material region that was neither manifested nor durably read', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'material_region',
          locator: { materialId: 'material-1', parseResultVersion: 2, pageNumber: 1 },
          excerpt: '九月川西团',
        },
      ]),
      authority: {
        ...authority,
        materials: [{ ...authority.materials[0]!, eligibleRegions: [] }],
      },
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: false,
      errors: [{ code: 'MATERIAL_REGION_NOT_READ' }],
    })
  })

  it('rejects an Attempt that is not linked to the supplied Context Manifest', () => {
    const result = validateEvidenceProposal({
      proposal: proposal([
        {
          schemaVersion: 1,
          kind: 'user_message',
          locator: { eventId: 'event-3', sequence: 3 },
          excerpt: '九月川西团',
        },
      ]),
      authority: {
        ...authority,
        attempt: { id: 'attempt-1', contextManifestId: 'manifest-other' },
      },
      systemRules: {},
    })

    expect(result).toMatchObject({
      success: false,
      errors: [{ code: 'ATTEMPT_MANIFEST_MISMATCH' }],
    })
  })

  it('分块抽取的关键字段可通过 locator 回到原文并进入通用证据校验', () => {
    const original =
      '请按资料建团。出团日期 2026-09-12。团费 12800元。姓名：张三。授权：可提交审核。'
    const index = buildSourceIndex(
      {
        kind: 'user_message',
        conversationId: 'conversation-1',
        eventId: 'event-3',
        sequence: 3,
      },
      original,
    )
    const date = index.facts.find((fact) => fact.kind === 'date')
    if (!date) {
      throw new Error('expected date fact')
    }
    const mapped = sourceFactToUserMessageEvidence(date)
    const result = validateEvidenceProposal({
      proposal: proposal([mapped]),
      authority: {
        ...authority,
        events: [
          {
            id: 'event-3',
            conversationId: 'conversation-1',
            sequence: 3,
            kind: 'user_message',
            text: original,
          },
        ],
      },
      systemRules: {},
    })

    expect(original.slice(date.charRange.start, date.charRange.end)).toBe('2026-09-12')
    expect(result).toMatchObject({
      success: true,
      normalizedProposal: {
        evidenceCatalog: [
          {
            kind: 'user_message',
            locator: { eventId: 'event-3', sequence: 3 },
            excerpt: { text: '2026-09-12' },
          },
        ],
      },
    })
  })
})
