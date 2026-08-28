import {
  AI_EVIDENCE_NORMALIZATION_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  adaptStoredParsePage,
  evidenceProposalSchemaV1,
  materialParsePageSchemaV1,
  normalizedEvidenceProposalSchemaV1,
} from './evidence-contract'

describe('evidence contract v1', () => {
  it('accepts the three versioned proposal locators', () => {
    const parsed = evidenceProposalSchemaV1.parse({
      schemaVersion: 1,
      candidates: [
        {
          candidateId: 'name',
          proposedValue: '九月川西团',
          evidence: [
            {
              schemaVersion: 1,
              kind: 'user_message',
              locator: { eventId: 'event-1', sequence: 3 },
              excerpt: '九月川西团',
            },
            {
              schemaVersion: 1,
              kind: 'material_region',
              locator: {
                materialId: 'material-1',
                parseResultVersion: 2,
                pageNumber: 1,
              },
              excerpt: '九月川西团',
            },
            {
              schemaVersion: 1,
              kind: 'system_derivation',
              locator: {
                ruleId: 'trip.end-date',
                ruleVersion: 1,
                inputEvidenceIndexes: [0],
              },
            },
          ],
        },
      ],
    })

    expect(parsed.schemaVersion).toBe(AI_EVIDENCE_SCHEMA_VERSION)
    expect(AI_EVIDENCE_NORMALIZATION_VERSION).toBe('unicode-nfc-whitespace-v1')
  })

  it('retains native geometry and identifies OCR score only as a quality signal', () => {
    const nativePage = materialParsePageSchemaV1.parse({
      schemaVersion: 1,
      pageNumber: 1,
      source: 'native_pdf',
      text: '团名：九月川西团',
      lines: [
        {
          lineNumber: 1,
          text: '团名：九月川西团',
          geometry: { x: 20, y: 30, width: 180, height: 20, unit: 'points' },
        },
      ],
    })
    const ocrPage = materialParsePageSchemaV1.parse({
      schemaVersion: 1,
      pageNumber: 1,
      source: 'ocr',
      text: '人数：12人',
      lines: [
        {
          lineNumber: 1,
          text: '人数：12人',
          geometry: { x: 20, y: 30, width: 180, height: 20, unit: 'pixels' },
          ocrQuality: { signal: 'rapidocr_line_score', score: 0.61 },
        },
      ],
    })

    expect(nativePage.lines[0]).not.toHaveProperty('ocrQuality')
    expect(ocrPage.lines[0]).toMatchObject({
      ocrQuality: { signal: 'rapidocr_line_score', score: 0.61 },
    })
    expect(ocrPage.lines[0]).not.toHaveProperty('confidence')
  })

  it('adapts RapidOCR stored pages into evidence page locators', () => {
    const page = adaptStoredParsePage({
      pageNumber: 1,
      source: 'ocr',
      text: '【草稿】赛里木湖1日',
      lines: [
        {
          text: '【草稿】赛里木湖1日',
          score: 0.99931,
          box: [
            [106, 77],
            [320, 77],
            [320, 104],
            [106, 104],
          ],
          coordinateSystem: 'pixel',
        },
      ],
    })
    expect(page).toMatchObject({
      schemaVersion: 1,
      pageNumber: 1,
      source: 'ocr',
      lines: [
        {
          lineNumber: 1,
          text: '【草稿】赛里木湖1日',
          geometry: { x: 106, y: 77, width: 214, height: 27, unit: 'pixels' },
          ocrQuality: { signal: 'rapidocr_line_score', score: 0.99931 },
        },
      ],
    })
  })

  it('requires normalized evidence catalog ids to remain associated per candidate', () => {
    const parsed = normalizedEvidenceProposalSchemaV1.parse({
      schemaVersion: 1,
      normalizationVersion: 'unicode-nfc-whitespace-v1',
      policyVersion: 'evidence-authenticity-v1',
      candidates: [
        {
          candidateIndex: 0,
          candidateId: 'name',
          proposedValue: '九月川西团',
          evidenceIds: ['evidence-1'],
        },
      ],
      evidenceCatalog: [
        {
          schemaVersion: 1,
          evidenceId: 'evidence-1',
          attemptId: 'attempt-1',
          contextManifestId: 'manifest-1',
          kind: 'user_message',
          locator: {
            conversationId: 'conversation-1',
            eventId: 'event-1',
            sequence: 3,
            normalizedTextRange: { start: 3, end: 9 },
          },
          excerpt: { text: '九月川西团', sha256: 'a'.repeat(64) },
          sourceSha256: 'b'.repeat(64),
        },
      ],
    })

    expect(parsed.candidates[0]?.evidenceIds).toEqual(['evidence-1'])
    expect(parsed.evidenceCatalog).toHaveLength(1)
  })

  it('rejects an oversized proposal at the contract boundary', () => {
    const candidates = Array.from({ length: 16 }, (_, candidateIndex) => ({
      candidateId: `candidate-${candidateIndex}`,
      proposedValue: '候选值',
      evidence: Array.from({ length: 16 }, (_, evidenceIndex) => ({
        schemaVersion: 1 as const,
        kind: 'user_message' as const,
        locator: { eventId: `event-${candidateIndex}-${evidenceIndex}`, sequence: evidenceIndex + 1 },
        excerpt: '证'.repeat(240),
      })),
    }))

    expect(() => evidenceProposalSchemaV1.parse({ schemaVersion: 1, candidates })).toThrow(
      '证据提案超过 JSON 大小上限',
    )
  })
})
