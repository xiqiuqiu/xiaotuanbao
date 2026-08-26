import {
  SOURCE_CHUNK_CONFIG_VERSION,
  SOURCE_CHUNK_POLICY_VERSION,
  SOURCE_EXTRACT_SCHEMA_VERSION,
  SOURCE_INDEX_DISCLAIMER,
  SOURCE_INDEX_POLICY_VERSION,
  buildSourceIndex,
  chunkSourceText,
  extractChunkFacts,
  originalSlice,
  reduceChunkResults,
  renderSourceIndexProjection,
  sourceFactToMaterialRegionEvidence,
  sourceFactToUserMessageEvidence,
} from './source-index'

const userOrigin = {
  kind: 'user_message' as const,
  conversationId: 'conv-1',
  eventId: 'event-9',
  sequence: 9,
}

const sourceOrigin = {
  kind: 'conversation_source' as const,
  conversationId: 'conv-1',
  sourceId: 'source-4',
  parseVersion: 3,
  pageNumber: 1,
}

const tight = { maxChars: 48, overlapChars: 12 }

function factsBlock() {
  return '出团日期 2026-09-12。团费 12800元。姓名：张三。授权：可提交审核。'
}

function filler(label: string, size: number) {
  return `${label}${'甲'.repeat(size)}`
}

function wellFormedUtf16(text: string): boolean {
  return !/[\uD800-\uDBFF]$/.test(text) && !/^[\uDC00-\uDFFF]/.test(text)
}

describe('超长输入分块与来源索引', () => {
  it('按段落、行和码点边界切块，不切开代理对，并记录版本化重叠范围', () => {
    const text = `ab😀\n\n${'丙'.repeat(20)}\n丁😀戊`
    const chunks = chunkSourceText(userOrigin, text, { maxChars: 8, overlapChars: 3 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => wellFormedUtf16(chunk.text))).toBe(true)
    expect(
      chunks.every((chunk) => {
        const coreStart = chunk.overlapRange?.end ?? chunk.locator.charRange.start
        const core = text.slice(coreStart, chunk.locator.charRange.end)
        return [...core].length <= 8
      }),
    ).toBe(true)
    expect(chunks[0]?.overlapRange).toBeNull()
    expect(chunks.slice(1).every((chunk) => chunk.overlapRange != null)).toBe(true)
    for (const chunk of chunks) {
      expect(chunk.text).toBe(text.slice(chunk.locator.charRange.start, chunk.locator.charRange.end))
      expect(chunk.locator.policyVersion).toBe(SOURCE_CHUNK_POLICY_VERSION)
      expect(chunk.locator.configVersion).not.toBe(SOURCE_CHUNK_CONFIG_VERSION)
      expect(chunk.locator.extractSchemaVersion).toBe(SOURCE_EXTRACT_SCHEMA_VERSION)
    }
    expect(chunks[0]?.text.startsWith('ab😀')).toBe(true)
  })

  it('同一原文与策略版本下分块可重放，默认配置写入正式 configVersion', () => {
    const text = `${factsBlock()}\n\n${filler('行程说明', 80)}`
    const left = chunkSourceText(userOrigin, text)
    const right = chunkSourceText(userOrigin, text)

    expect(right).toEqual(left)
    expect(left[0]?.locator.configVersion).toBe(SOURCE_CHUNK_CONFIG_VERSION)
    expect(left[0]?.locator.policyVersion).toBe(SOURCE_CHUNK_POLICY_VERSION)
  })

  it('每块抽取日期、金额、身份和授权，locator 能回到原文精确范围', () => {
    const text = `${factsBlock()}\n\n${filler('补充', 60)}`
    const chunks = chunkSourceText(userOrigin, text, tight)
    const first = extractChunkFacts(chunks[0]!)

    expect(first.extractSchemaVersion).toBe(SOURCE_EXTRACT_SCHEMA_VERSION)
    expect(first.facts.map((fact) => [fact.kind, fact.value])).toEqual([
      ['date', '2026-09-12'],
      ['amount', '12800元'],
      ['identity', '张三'],
      ['authorization', '可提交审核'],
    ])
    for (const fact of first.facts) {
      expect(originalSlice(text, fact)).toContain(fact.value)
      expect(text.slice(fact.charRange.start, fact.charRange.end)).toBe(fact.excerpt)
    }
  })

  it('重叠区相同事实只保留一次；乱序完成得到同一 digest', () => {
    const text = `${factsBlock()}\n${filler('前段', 30)}\n${factsBlock()}\n${filler('后段', 30)}`
    const chunks = chunkSourceText(userOrigin, text, { maxChars: 40, overlapChars: 20 })
    const extractions = chunks.map((chunk) => extractChunkFacts(chunk))
    const ordered = reduceChunkResults(userOrigin, text, extractions)
    const shuffled = reduceChunkResults(userOrigin, text, [...extractions].reverse())

    expect(ordered.digest).toBe(shuffled.digest)
    expect(ordered.facts.filter((fact) => fact.kind === 'date' && fact.value === '2026-09-12')).toHaveLength(1)
    expect(ordered.policyVersion).toBe(SOURCE_INDEX_POLICY_VERSION)
  })

  it('不同块对同一字段给出不同值时保留冲突，不静默择一', () => {
    const text = `出团日期 2026-09-12。${filler('A', 40)}\n出团日期 2026-10-01。${filler('B', 40)}`
    const index = buildSourceIndex(userOrigin, text, { maxChars: 36, overlapChars: 4 })

    expect(index.complete).toBe(true)
    expect(index.conflicts).toEqual([
      expect.objectContaining({
        kind: 'date',
        values: ['2026-09-12', '2026-10-01'],
      }),
    ])
    expect(index.facts.filter((fact) => fact.kind === 'date')).toHaveLength(0)
  })

  it('单块失败可独立重试，重放不重复成功事实', () => {
    const text = `${factsBlock()}\n\n${filler('尾部', 50)}`
    const chunks = chunkSourceText(userOrigin, text, tight)
    expect(chunks.length).toBeGreaterThan(1)
    const successes = chunks.map((chunk) => extractChunkFacts(chunk))
    const failed = {
      chunkIndex: 1,
      locator: chunks[1]!.locator,
      errorCode: 'EXTRACT_FAILED',
    }
    const partial = reduceChunkResults(userOrigin, text, [successes[0]!, failed, ...successes.slice(2)])
    expect(partial.complete).toBe(false)
    expect(partial.failedChunkIndexes).toEqual([1])

    const retried = reduceChunkResults(userOrigin, text, [successes[0]!, successes[1]!, ...successes.slice(2)])
    const replay = buildSourceIndex(userOrigin, text, tight)

    expect(retried.complete).toBe(true)
    expect(retried.digest).toBe(replay.digest)
    expect(retried.facts.filter((fact) => fact.kind === 'amount')).toHaveLength(1)
  })

  it('主 Agent 投影远小于原文，且声明不能替代原文', () => {
    const text = `${factsBlock()}\n${filler('超大资料正文', 4_000)}`
    const index = buildSourceIndex(sourceOrigin, text)
    const projection = renderSourceIndexProjection(index)

    expect(projection.length).toBeLessThan(text.length / 4)
    expect(projection).toContain(SOURCE_INDEX_DISCLAIMER)
    expect(projection).toContain('2026-09-12')
    expect(projection).toContain('12800元')
    expect(projection).not.toContain('甲'.repeat(200))
    expect(index.inputDigest).toHaveLength(64)
    expect(index.origin).toEqual(sourceOrigin)
  })

  it('抽取结果可转成通用证据提案定位，摘录落在原文', () => {
    const text = `请按 ${factsBlock()} 建团`
    const index = buildSourceIndex(userOrigin, text, tight)
    const date = index.facts.find((fact) => fact.kind === 'date')
    const evidence = sourceFactToUserMessageEvidence(date!)

    expect(evidence).toEqual({
      schemaVersion: 1,
      kind: 'user_message',
      locator: { eventId: 'event-9', sequence: 9 },
      excerpt: '2026-09-12',
    })
    expect(text).toContain(evidence.excerpt)

    const sourceIndex = buildSourceIndex(sourceOrigin, `页内 ${factsBlock()}`, tight)
    const amount = sourceIndex.facts.find((fact) => fact.kind === 'amount')
    expect(sourceFactToMaterialRegionEvidence(amount!)).toEqual({
      schemaVersion: 1,
      kind: 'material_region',
      locator: {
        sourceId: 'source-4',
        parseResultVersion: 3,
        pageNumber: 1,
      },
      excerpt: '12800元',
    })
  })
})
