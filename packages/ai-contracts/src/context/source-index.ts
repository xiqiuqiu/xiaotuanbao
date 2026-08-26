import { sha256Hex } from './sha256'

export const SOURCE_CHUNK_POLICY_VERSION = 'paragraph-line-codepoint/v1'
export const SOURCE_CHUNK_CONFIG_VERSION = 'chars-4000-overlap-200/v1'
export const SOURCE_EXTRACT_SCHEMA_VERSION = 'facts-date-amount-identity-auth/v1'
export const SOURCE_INDEX_POLICY_VERSION = 'idempotent-overlap-conflict/v1'
export const SOURCE_INDEX_MODEL_ID = 'deterministic'
export const SOURCE_CHUNK_MAX_CHARS = 4_000
export const SOURCE_CHUNK_OVERLAP_CHARS = 200
export const SOURCE_INDEX_DISCLAIMER =
  '本索引不是原文、授权或候选证据。关键日期、金额、身份和授权须按 locator 回读原文并进入证据校验。'
export const OVERSIZED_INPUT_CHUNKED_TRUNCATION = 'oversized_input_chunked'

export type SourceIndexOrigin =
  | {
      kind: 'user_message'
      conversationId: string
      eventId: string
      sequence: number
    }
  | {
      kind: 'conversation_source'
      conversationId: string
      sourceId: string
      parseVersion: number
      pageNumber: number | null
    }

export type SourceChunkerConfig = {
  maxChars: number
  overlapChars: number
}

export type SourceChunkLocator = {
  kind: 'oversized_input_chunk'
  origin: SourceIndexOrigin
  chunkIndex: number
  charRange: { start: number; end: number }
  overlapRange: { start: number; end: number } | null
  contentDigest: string
  policyVersion: string
  configVersion: string
  extractSchemaVersion: string
}

export type SourceChunk = {
  text: string
  overlapRange: { start: number; end: number } | null
  locator: SourceChunkLocator
}

export type SourceFactKind = 'date' | 'amount' | 'identity' | 'authorization'

export type SourceFact = {
  kind: SourceFactKind
  value: string
  excerpt: string
  locator: SourceChunkLocator
  charRange: { start: number; end: number }
}

export type ChunkExtraction = {
  chunkIndex: number
  locator: SourceChunkLocator
  extractSchemaVersion: string
  text: string
  facts: SourceFact[]
  digest: string
}

export type ChunkFailure = {
  chunkIndex: number
  locator: SourceChunkLocator
  errorCode: string
}

export type SourceConflict = {
  kind: SourceFactKind
  values: string[]
  locators: SourceChunkLocator[]
}

export type SourceIndexRecord = {
  policyVersion: string
  configVersion: string
  extractSchemaVersion: string
  modelId: string
  origin: SourceIndexOrigin
  chunkCount: number
  completedChunkIndexes: number[]
  failedChunkIndexes: number[]
  locators: SourceChunkLocator[]
  facts: SourceFact[]
  conflicts: SourceConflict[]
  summary: string
  digest: string
  inputDigest: string
  complete: boolean
}

const FACT_PATTERNS: Array<{ kind: SourceFactKind; regex: RegExp; value: (match: RegExpExecArray) => string }> = [
  {
    kind: 'date',
    regex: /(\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月\d{1,2}日)/g,
    value: (match) => match[1] ?? match[0],
  },
  {
    kind: 'amount',
    regex: /(¥\s?\d[\d,]*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?元)/g,
    value: (match) => match[1] ?? match[0],
  },
  {
    kind: 'identity',
    regex: /姓名[:：]\s*([^\s。，,；;]{1,20})/g,
    value: (match) => match[1] ?? match[0],
  },
  {
    kind: 'authorization',
    regex: /授权[:：]\s*([^\n。]{1,40})/g,
    value: (match) => match[1] ?? match[0],
  },
]

export function resolveChunkerConfig(config?: Partial<SourceChunkerConfig>): SourceChunkerConfig {
  return {
    maxChars: config?.maxChars ?? SOURCE_CHUNK_MAX_CHARS,
    overlapChars: config?.overlapChars ?? SOURCE_CHUNK_OVERLAP_CHARS,
  }
}

export function chunkerConfigVersion(config: SourceChunkerConfig): string {
  if (
    config.maxChars === SOURCE_CHUNK_MAX_CHARS &&
    config.overlapChars === SOURCE_CHUNK_OVERLAP_CHARS
  ) {
    return SOURCE_CHUNK_CONFIG_VERSION
  }
  return `chars-${config.maxChars}-overlap-${config.overlapChars}/v1`
}

export function chunkSourceText(
  origin: SourceIndexOrigin,
  text: string,
  config?: Partial<SourceChunkerConfig>,
): SourceChunk[] {
  const resolved = resolveChunkerConfig(config)
  const version = chunkerConfigVersion(resolved)
  const cores = coreRanges(text, resolved.maxChars)
  return cores.map((core, chunkIndex) => {
    const overlapStart =
      chunkIndex === 0 ? core.start : retreatCodePoints(text, core.start, resolved.overlapChars)
    const start = Math.max(0, overlapStart)
    const overlapRange =
      start < core.start ? { start, end: core.start } : null
    const slice = text.slice(start, core.end)
    const locator: SourceChunkLocator = {
      kind: 'oversized_input_chunk',
      origin,
      chunkIndex,
      charRange: { start, end: core.end },
      overlapRange,
      contentDigest: sha256Hex(slice),
      policyVersion: SOURCE_CHUNK_POLICY_VERSION,
      configVersion: version,
      extractSchemaVersion: SOURCE_EXTRACT_SCHEMA_VERSION,
    }
    return { text: slice, overlapRange, locator }
  })
}

export function extractChunkFacts(chunk: SourceChunk): ChunkExtraction {
  const facts: SourceFact[] = []
  for (const pattern of FACT_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match = regex.exec(chunk.text)
    while (match) {
      const excerpt = match[0]
      const start = chunk.locator.charRange.start + match.index
      facts.push({
        kind: pattern.kind,
        value: pattern.value(match),
        excerpt,
        locator: chunk.locator,
        charRange: { start, end: start + excerpt.length },
      })
      match = regex.exec(chunk.text)
    }
  }
  return {
    chunkIndex: chunk.locator.chunkIndex,
    locator: chunk.locator,
    extractSchemaVersion: SOURCE_EXTRACT_SCHEMA_VERSION,
    text: chunk.text,
    facts,
    digest: sha256Hex(
      stableJson({
        chunkIndex: chunk.locator.chunkIndex,
        facts: facts.map((fact) => ({
          kind: fact.kind,
          value: fact.value,
          charRange: fact.charRange,
        })),
      }),
    ),
  }
}

export function reduceChunkResults(
  origin: SourceIndexOrigin,
  text: string,
  results: Array<ChunkExtraction | ChunkFailure>,
): SourceIndexRecord {
  const ordered = [...results].sort((left, right) => left.chunkIndex - right.chunkIndex)
  const locators = ordered.map((item) => item.locator)
  const configVersion = locators[0]?.configVersion ?? SOURCE_CHUNK_CONFIG_VERSION
  const completed = ordered.filter((item): item is ChunkExtraction => 'facts' in item)
  const failed = ordered.filter((item): item is ChunkFailure => 'errorCode' in item)
  const mergedFacts: SourceFact[] = []
  const conflicts: SourceConflict[] = []
  const byKind = new Map<SourceFactKind, SourceFact[]>()
  for (const extraction of completed) {
    for (const fact of extraction.facts) {
      const existing = byKind.get(fact.kind) ?? []
      existing.push(fact)
      byKind.set(fact.kind, existing)
    }
  }
  for (const [kind, kindFacts] of byKind) {
    const uniqueValues = [...new Set(kindFacts.map((fact) => fact.value))]
    if (uniqueValues.length > 1) {
      conflicts.push({
        kind,
        values: uniqueValues,
        locators: uniqueLocators(kindFacts.map((fact) => fact.locator)),
      })
      continue
    }
    const first = [...kindFacts].sort(
      (left, right) =>
        left.locator.chunkIndex - right.locator.chunkIndex ||
        left.charRange.start - right.charRange.start,
    )[0]
    if (first) {
      mergedFacts.push(first)
    }
  }
  mergedFacts.sort(
    (left, right) =>
      left.charRange.start - right.charRange.start || left.kind.localeCompare(right.kind),
  )
  conflicts.sort((left, right) => left.kind.localeCompare(right.kind))
  const complete = failed.length === 0
  const body = {
    policyVersion: SOURCE_INDEX_POLICY_VERSION,
    configVersion,
    extractSchemaVersion: SOURCE_EXTRACT_SCHEMA_VERSION,
    modelId: SOURCE_INDEX_MODEL_ID,
    origin,
    chunkCount: ordered.length,
    completedChunkIndexes: completed.map((item) => item.chunkIndex),
    failedChunkIndexes: failed.map((item) => item.chunkIndex),
    locators,
    facts: mergedFacts,
    conflicts,
    complete,
  }
  const summary = renderSourceIndexProjection({
    ...body,
    summary: '',
    digest: '',
    inputDigest: '',
  })
  return {
    ...body,
    summary,
    digest: sha256Hex(stableJson({ ...body, summary })),
    inputDigest: sha256Hex(stableJson({ origin, text, policyVersion: SOURCE_INDEX_POLICY_VERSION })),
  }
}

export function buildSourceIndex(
  origin: SourceIndexOrigin,
  text: string,
  config?: Partial<SourceChunkerConfig>,
): SourceIndexRecord {
  const chunks = chunkSourceText(origin, text, config)
  return reduceChunkResults(
    origin,
    text,
    chunks.map((chunk) => extractChunkFacts(chunk)),
  )
}

export function renderSourceIndexProjection(index: Omit<SourceIndexRecord, 'digest' | 'inputDigest' | 'summary'> & {
  summary?: string
  digest?: string
  inputDigest?: string
}): string {
  const originLine =
    index.origin.kind === 'user_message'
      ? `user_message seq=${index.origin.sequence} event=${index.origin.eventId}`
      : `conversation_source id=${index.origin.sourceId} parse=${index.origin.parseVersion} page=${index.origin.pageNumber ?? 'all'}`
  const factLines = index.facts.map(
    (fact) =>
      `- ${fact.kind} ${fact.value} locator=${formatLocator(fact.locator)} range=${fact.charRange.start}-${fact.charRange.end}`,
  )
  const conflictLines = index.conflicts.map(
    (conflict) => `- ${conflict.kind} ${conflict.values.join(' | ')}`,
  )
  const chunkLines = index.locators.map(
    (locator) =>
      `- chunk ${locator.chunkIndex} chars ${locator.charRange.start}-${locator.charRange.end} digest=${locator.contentDigest.slice(0, 12)}`,
  )
  return [
    '【超长输入来源索引】',
    SOURCE_INDEX_DISCLAIMER,
    `来源 ${originLine}；分块 ${index.chunkCount}；完成 ${index.complete ? '是' : '否'}；policy=${index.policyVersion}；extract=${index.extractSchemaVersion}。`,
    '',
    '事实：',
    ...(factLines.length > 0 ? factLines : ['- （无）']),
    '',
    '冲突：',
    ...(conflictLines.length > 0 ? conflictLines : ['- （无）']),
    '',
    '分块：',
    ...chunkLines,
  ].join('\n')
}

export function originalSlice(
  text: string,
  locator: { charRange: { start: number; end: number } },
): string {
  return text.slice(locator.charRange.start, locator.charRange.end)
}

export function sourceFactToUserMessageEvidence(fact: SourceFact): {
  schemaVersion: 1
  kind: 'user_message'
  locator: { eventId: string; sequence: number }
  excerpt: string
} {
  if (fact.locator.origin.kind !== 'user_message') {
    throw new Error('source fact origin is not user_message')
  }
  return {
    schemaVersion: 1,
    kind: 'user_message',
    locator: {
      eventId: fact.locator.origin.eventId,
      sequence: fact.locator.origin.sequence,
    },
    excerpt: fact.excerpt,
  }
}

export function sourceFactToMaterialRegionEvidence(fact: SourceFact): {
  schemaVersion: 1
  kind: 'material_region'
  locator: { sourceId: string; parseResultVersion: number; pageNumber: number }
  excerpt: string
} {
  if (fact.locator.origin.kind !== 'conversation_source') {
    throw new Error('source fact origin is not conversation_source')
  }
  const pageNumber = fact.locator.origin.pageNumber
  if (pageNumber == null) {
    throw new Error('material region evidence requires a page number')
  }
  return {
    schemaVersion: 1,
    kind: 'material_region',
    locator: {
      sourceId: fact.locator.origin.sourceId,
      parseResultVersion: fact.locator.origin.parseVersion,
      pageNumber,
    },
    excerpt: fact.excerpt,
  }
}

function coreRanges(text: string, maxChars: number): Array<{ start: number; end: number }> {
  if (text.length === 0) {
    return [{ start: 0, end: 0 }]
  }
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  while (start < text.length) {
    const maxEnd = advanceCodePoints(text, start, maxChars)
    let end = maxEnd
    if (end < text.length) {
      const broken = lastNaturalBreak(text, start, end)
      if (broken != null) {
        end = broken
      }
    }
    if (end <= start) {
      end = nextCodePointIndex(text, start)
    }
    ranges.push({ start, end })
    start = end
  }
  return ranges
}

function lastNaturalBreak(text: string, start: number, end: number): number | null {
  const window = text.slice(start, end)
  const paragraph = window.lastIndexOf('\n\n')
  if (paragraph >= 0) {
    const index = start + paragraph + 2
    if (index > start && index <= end) {
      return index
    }
  }
  const line = window.lastIndexOf('\n')
  if (line >= 0) {
    const index = start + line + 1
    if (index > start && index <= end) {
      return index
    }
  }
  return null
}

function nextCodePointIndex(text: string, index: number): number {
  if (index >= text.length) {
    return text.length
  }
  const code = text.charCodeAt(index)
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
    const next = text.charCodeAt(index + 1)
    if (next >= 0xdc00 && next <= 0xdfff) {
      return index + 2
    }
  }
  return index + 1
}

function prevCodePointIndex(text: string, index: number): number {
  if (index <= 0) {
    return 0
  }
  const code = text.charCodeAt(index - 1)
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) {
    const prev = text.charCodeAt(index - 2)
    if (prev >= 0xd800 && prev <= 0xdbff) {
      return index - 2
    }
  }
  return index - 1
}

function advanceCodePoints(text: string, start: number, count: number): number {
  let index = start
  let remaining = count
  while (remaining > 0 && index < text.length) {
    index = nextCodePointIndex(text, index)
    remaining -= 1
  }
  return index
}

function retreatCodePoints(text: string, start: number, count: number): number {
  let index = start
  let remaining = count
  while (remaining > 0 && index > 0) {
    index = prevCodePointIndex(text, index)
    remaining -= 1
  }
  return index
}

function uniqueLocators(locators: SourceChunkLocator[]): SourceChunkLocator[] {
  const seen = new Set<string>()
  const unique: SourceChunkLocator[] = []
  for (const locator of locators) {
    const key = `${locator.chunkIndex}:${locator.charRange.start}:${locator.charRange.end}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(locator)
  }
  return unique
}

function formatLocator(locator: SourceChunkLocator): string {
  const origin =
    locator.origin.kind === 'user_message'
      ? `conversation_event:${locator.origin.conversationId}:${locator.origin.sequence}`
      : `conversation_source:${locator.origin.sourceId}:${locator.origin.parseVersion}`
  return `${origin}:chunk:${locator.chunkIndex}:${locator.charRange.start}-${locator.charRange.end}`
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}
