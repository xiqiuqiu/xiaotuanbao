import { z } from 'zod'

export const AI_EVIDENCE_SCHEMA_VERSION = 1 as const
export const AI_EVIDENCE_NORMALIZATION_VERSION = 'unicode-nfc-whitespace-v1' as const
export const AI_EVIDENCE_POLICY_VERSION = 'evidence-authenticity-v1' as const
export const AI_EVIDENCE_EXCERPT_MAX_CHARS = 240
export const AI_EVIDENCE_CANDIDATE_LIMIT = 16
export const AI_EVIDENCE_PER_CANDIDATE_LIMIT = 16
export const AI_EVIDENCE_PROPOSAL_JSON_MAX_BYTES = 32_000
export const AI_EVIDENCE_NORMALIZED_JSON_MAX_BYTES = 128_000

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const textRangeSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict()

/** UTF-8 字节数。不依赖 DOM / @types/node，避免 CI 的 ES2022-only lib 编不过。 */
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

function jsonUtf8ByteLength(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value))
}

export const evidenceGeometrySchemaV1 = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['points', 'pixels']),
  })
  .strict()

const nativePdfLineSchemaV1 = z
  .object({
    lineNumber: z.number().int().positive(),
    text: z.string(),
    geometry: evidenceGeometrySchemaV1.optional(),
  })
  .strict()

const ocrLineSchemaV1 = z
  .object({
    lineNumber: z.number().int().positive(),
    text: z.string(),
    geometry: evidenceGeometrySchemaV1,
    ocrQuality: z
      .object({
        signal: z.literal('rapidocr_line_score'),
        score: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict()

export const materialParsePageSchemaV1 = z.discriminatedUnion('source', [
  z
    .object({
      schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
      pageNumber: z.number().int().positive(),
      source: z.literal('native_pdf'),
      text: z.string(),
      lines: z.array(nativePdfLineSchemaV1),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
      pageNumber: z.number().int().positive(),
      source: z.literal('ocr'),
      text: z.string(),
      lines: z.array(ocrLineSchemaV1),
    })
    .strict(),
])

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function geometryFromBox(
  box: unknown,
  unit: 'points' | 'pixels',
): z.infer<typeof evidenceGeometrySchemaV1> | null {
  if (!Array.isArray(box) || box.length === 0) {
    return null
  }
  if (box.length === 4 && box.every((item) => typeof item === 'number')) {
    const [x, y, width, height] = box as [number, number, number, number]
    if (width <= 0 || height <= 0) {
      return null
    }
    return { x, y, width, height, unit }
  }
  if (
    box.length === 4 &&
    box.every((point) => Array.isArray(point) && point.length >= 2)
  ) {
    const xs = (box as Array<[number, number]>).map((point) => point[0])
    const ys = (box as Array<[number, number]>).map((point) => point[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    const width = Math.max(...xs) - x
    const height = Math.max(...ys) - y
    if (width <= 0 || height <= 0) {
      return null
    }
    return { x, y, width, height, unit }
  }
  return null
}

export function adaptStoredParsePage(page: unknown): MaterialParsePageV1 | null {
  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    return null
  }
  const record = page as Record<string, unknown>
  const pageNumber = Number(record.pageNumber)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return null
  }
  const source = record.source === 'native_pdf' ? 'native_pdf' : record.source === 'ocr' ? 'ocr' : null
  if (!source) {
    return null
  }
  const text = typeof record.text === 'string' ? record.text : ''
  const rawLines = Array.isArray(record.lines) ? record.lines : []
  if (source === 'native_pdf') {
    const lines = rawLines.flatMap((line, index) => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        return []
      }
      const item = line as Record<string, unknown>
      const lineText = typeof item.text === 'string' ? item.text : ''
      const lineNumber = Number(item.lineNumber)
      const geometry =
        item.geometry && typeof item.geometry === 'object'
          ? evidenceGeometrySchemaV1.safeParse(item.geometry).data
          : geometryFromBox(item.box, item.coordinateSystem === 'pixel' ? 'pixels' : 'points')
      return [
        {
          lineNumber: Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : index + 1,
          text: lineText,
          ...(geometry ? { geometry } : {}),
        },
      ]
    })
    return {
      schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
      pageNumber,
      source,
      text,
      lines,
    }
  }
  const lines = rawLines.flatMap((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      return []
    }
    const item = line as Record<string, unknown>
    const lineText = typeof item.text === 'string' ? item.text : ''
    const lineNumber = Number(item.lineNumber)
    const geometry =
      item.geometry && typeof item.geometry === 'object'
        ? evidenceGeometrySchemaV1.safeParse(item.geometry).data
        : geometryFromBox(item.box, 'pixels')
    const score =
      item.ocrQuality && typeof item.ocrQuality === 'object'
        ? positiveNumber((item.ocrQuality as { score?: unknown }).score)
        : positiveNumber(item.score)
    if (!geometry || score == null || score > 1) {
      return []
    }
    return [
      {
        lineNumber: Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : index + 1,
        text: lineText,
        geometry,
        ocrQuality: { signal: 'rapidocr_line_score' as const, score },
      },
    ]
  })
  return {
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    pageNumber,
    source,
    text,
    lines,
  }
}

export const evidenceCandidateProposalSchemaV1 = z
  .object({
    candidateId: z.string().min(1).max(100),
    proposedValue: z.union([z.string().trim().min(1).max(200), z.number().int().min(0).max(9999)]),
    evidence: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
              kind: z.literal('user_message'),
              locator: z
                .object({
                  eventId: z.string().min(1),
                  sequence: z.number().int().positive(),
                })
                .strict(),
              excerpt: z.string().trim().min(1).max(AI_EVIDENCE_EXCERPT_MAX_CHARS),
            })
            .strict(),
          z
            .object({
              schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
              kind: z.literal('material_region'),
              locator: z
                .object({
                  materialId: z.string().min(1).optional(),
                  sourceId: z.string().min(1).optional(),
                  parseResultVersion: z.number().int().positive(),
                  pageNumber: z.number().int().positive(),
                })
                .strict()
                .refine((locator) => Boolean(locator.sourceId ?? locator.materialId), {
                  message: 'material_region 必须提供 sourceId 或 materialId',
                }),
              excerpt: z.string().trim().min(1).max(AI_EVIDENCE_EXCERPT_MAX_CHARS),
            })
            .strict(),
          z
            .object({
              schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
              kind: z.literal('system_derivation'),
              locator: z
                .object({
                  ruleId: z.string().min(1).max(100),
                  ruleVersion: z.number().int().positive(),
                  inputEvidenceIndexes: z.array(z.number().int().nonnegative()).min(1),
                })
                .strict(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(AI_EVIDENCE_PER_CANDIDATE_LIMIT),
  })
  .strict()

export const evidenceProposalSchemaV1 = z
  .object({
    schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
    candidates: z.array(evidenceCandidateProposalSchemaV1).min(1).max(AI_EVIDENCE_CANDIDATE_LIMIT),
  })
  .strict()
  .refine(
    (value) => new Set(value.candidates.map((candidate) => candidate.candidateId)).size === value.candidates.length,
    { message: '同一证据提案内 candidateId 必须唯一' },
  )
  .refine(
    (value) => jsonUtf8ByteLength(value) <= AI_EVIDENCE_PROPOSAL_JSON_MAX_BYTES,
    { message: '证据提案超过 JSON 大小上限' },
  )

const normalizedExcerptSchemaV1 = z
  .object({ text: z.string().min(1).max(AI_EVIDENCE_EXCERPT_MAX_CHARS), sha256: sha256Schema })
  .strict()

const normalizedGeometrySchemaV1 = evidenceGeometrySchemaV1.extend({
  lineNumber: z.number().int().positive(),
})

export const normalizedEvidenceSchemaV1 = z.discriminatedUnion('kind', [
  z
    .object({
      schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
      evidenceId: z.string().min(1),
      attemptId: z.string().min(1),
      contextManifestId: z.string().min(1),
      kind: z.literal('user_message'),
      locator: z
        .object({
          conversationId: z.string().min(1),
          eventId: z.string().min(1),
          sequence: z.number().int().positive(),
          normalizedTextRange: textRangeSchema,
        })
        .strict(),
      excerpt: normalizedExcerptSchemaV1,
      sourceSha256: sha256Schema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
      evidenceId: z.string().min(1),
      attemptId: z.string().min(1),
      contextManifestId: z.string().min(1),
      kind: z.literal('material_region'),
      locator: z
        .object({
          inputBatchId: z.string().min(1),
          materialId: z.string().min(1),
          parseResultVersion: z.number().int().positive(),
          pageNumber: z.number().int().positive(),
          source: z.enum(['native_pdf', 'ocr']),
          normalizedTextRange: textRangeSchema,
          lineRange: z
            .object({ start: z.number().int().positive(), end: z.number().int().positive() })
            .strict(),
          regions: z.array(normalizedGeometrySchemaV1),
          evidenceSource: z.discriminatedUnion('kind', [
            z
              .object({
                kind: z.literal('initial_manifest_excerpt'),
                fragmentId: z.string().min(1),
              })
              .strict(),
            z
              .object({
                kind: z.literal('directed_read'),
                readReceiptId: z.string().min(1),
                actionId: z.string().min(1),
              })
              .strict(),
          ]),
        })
        .strict(),
      excerpt: normalizedExcerptSchemaV1,
      sourceSha256: sha256Schema,
      recognitionQuality: z
        .object({
          signal: z.literal('rapidocr_line_score'),
          lines: z.array(
            z
              .object({
                lineNumber: z.number().int().positive(),
                score: z.number().min(0).max(1),
              })
              .strict(),
          ),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
      evidenceId: z.string().min(1),
      attemptId: z.string().min(1),
      contextManifestId: z.string().min(1),
      kind: z.literal('system_derivation'),
      locator: z
        .object({
          ruleId: z.string().min(1),
          ruleVersion: z.number().int().positive(),
          inputEvidenceIds: z.array(z.string().min(1)).min(1),
        })
        .strict(),
      excerpt: normalizedExcerptSchemaV1,
      sourceSha256: sha256Schema,
    })
    .strict(),
])

export const normalizedEvidenceProposalSchemaV1 = z
  .object({
    schemaVersion: z.literal(AI_EVIDENCE_SCHEMA_VERSION),
    normalizationVersion: z.literal(AI_EVIDENCE_NORMALIZATION_VERSION),
    policyVersion: z.literal(AI_EVIDENCE_POLICY_VERSION),
    candidates: z.array(
      z
        .object({
          candidateIndex: z.number().int().nonnegative(),
          candidateId: z.string().min(1).max(100),
          proposedValue: z.union([z.string().min(1).max(200), z.number().int().min(0).max(9999)]),
          evidenceIds: z.array(z.string().min(1)).min(1),
        })
        .strict(),
    ),
    evidenceCatalog: z.array(normalizedEvidenceSchemaV1),
  })
  .strict()
  .superRefine((value, context) => {
    const catalogIds = new Set(value.evidenceCatalog.map((evidence) => evidence.evidenceId))
    if (catalogIds.size !== value.evidenceCatalog.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: '证据目录 evidenceId 必须唯一' })
    }
    value.candidates.forEach((candidate, candidateIndex) => {
      candidate.evidenceIds.forEach((evidenceId) => {
        if (!catalogIds.has(evidenceId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: '候选引用了证据目录中不存在的 evidenceId',
            path: ['candidates', candidateIndex, 'evidenceIds'],
          })
        }
      })
    })
  })
  .refine(
    (value) => jsonUtf8ByteLength(value) <= AI_EVIDENCE_NORMALIZED_JSON_MAX_BYTES,
    { message: '规范化证据记录超过 JSON 大小上限' },
  )

export type EvidenceGeometryV1 = z.infer<typeof evidenceGeometrySchemaV1>
export type MaterialParsePageV1 = z.infer<typeof materialParsePageSchemaV1>
export type EvidenceCandidateProposalV1 = z.infer<typeof evidenceCandidateProposalSchemaV1>
export type EvidenceProposalV1 = z.infer<typeof evidenceProposalSchemaV1>
export type NormalizedEvidenceV1 = z.infer<typeof normalizedEvidenceSchemaV1>
export type NormalizedEvidenceProposalV1 = z.infer<typeof normalizedEvidenceProposalSchemaV1>
