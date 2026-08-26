import {
  CONTEXT_COMPACTION_DISCLAIMER,
  CONTEXT_COMPACTION_KEEP_TAIL,
  CONTEXT_COMPACTION_POLICY_VERSION,
  compactConversationEvents,
  eventLocatorFor,
  selectCompactableEvents,
  splitCompactionWindow,
} from './compaction'

function eventsFor(count: number, currentSequence = count): Array<{
  sequence: number
  kind: string
  text: string
}> {
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    kind: index % 2 === 0 ? 'user_message' : 'agent_message',
    text: `历史消息-${index + 1}-路线按川西环线`,
  })).filter((event) => event.sequence !== currentSequence)
}

describe('确定性 AI 上下文压缩版本', () => {
  it('同一冻结输入在相同策略版本下产生可重放的摘要、范围与 digest', () => {
    const events = eventsFor(20, 20)
    const left = compactConversationEvents({
      conversationId: 'conv-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events,
    })
    const right = compactConversationEvents({
      conversationId: 'conv-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: events.map((event) => ({ ...event })),
    })

    expect(left).not.toBeNull()
    expect(right).toEqual(left)
    expect(left?.policyVersion).toBe(CONTEXT_COMPACTION_POLICY_VERSION)
    expect(left?.coveredEventSequences).toEqual(
      events.slice(0, events.length - CONTEXT_COMPACTION_KEEP_TAIL).map((event) => event.sequence),
    )
    expect(left?.digest).toHaveLength(64)
    expect(left?.inputDigest).toHaveLength(64)
    expect(left?.summary).toContain(CONTEXT_COMPACTION_DISCLAIMER)
    expect(left?.locators).toHaveLength(left?.coveredEventSequences.length ?? 0)
  })

  it('不把当前 User 输入、未决状态事件或冻结版本之后的消息写入压缩范围', () => {
    const compacted = compactConversationEvents({
      conversationId: 'conv-1',
      conversationVersion: 6,
      currentUserMessageSequence: 5,
      events: [
        { sequence: 1, kind: 'user_message', text: '最早的问题' },
        { sequence: 2, kind: 'agent_message', text: '最早的回复' },
        { sequence: 3, kind: 'batch_status', text: 'awaiting_review' },
        { sequence: 4, kind: 'agent_message', text: '中间回复' },
        { sequence: 5, kind: 'user_message', text: '本轮唯一指令' },
        { sequence: 7, kind: 'user_message', text: '尚未冻结' },
      ],
    })

    expect(selectCompactableEvents(
      [
        { sequence: 1, kind: 'user_message', text: '最早的问题' },
        { sequence: 3, kind: 'batch_status', text: 'awaiting_review' },
        { sequence: 5, kind: 'user_message', text: '本轮唯一指令' },
        { sequence: 7, kind: 'user_message', text: '尚未冻结' },
      ],
      6,
      5,
    ).map((event) => event.sequence)).toEqual([1])
    expect(compacted).toBeNull()
  })

  it('每个被覆盖事件都保留可回读 locator 与原文 digest', () => {
    const event = { sequence: 2, kind: 'user_message', text: '出团日期还没定' }
    const locator = eventLocatorFor('conv-9', event)
    const compacted = compactConversationEvents({
      conversationId: 'conv-9',
      conversationVersion: 12,
      currentUserMessageSequence: 12,
      events: eventsFor(12, 12).map((item) => (item.sequence === 2 ? event : item)),
    })

    expect(locator).toMatchObject({
      kind: 'conversation_event',
      conversationId: 'conv-9',
      sequence: 2,
      eventKind: 'user_message',
      charRange: { start: 0, end: event.text.length },
    })
    expect(compacted?.locators.find((item) => item.sequence === 2)).toEqual(locator)
  })

  it('近期尾部保留在压缩窗口之外，供激活后继续作为原文尾部', () => {
    const compactable = eventsFor(20, 20)
    expect(splitCompactionWindow(compactable).keepTail).toHaveLength(CONTEXT_COMPACTION_KEEP_TAIL)
    expect(splitCompactionWindow(compactable).compact.at(-1)?.sequence).toBe(
      compactable[compactable.length - CONTEXT_COMPACTION_KEEP_TAIL - 1]?.sequence,
    )
  })
})
