import {
  composePlaintextUserText,
  parseEventSequences,
  projectConversationEventsForAgent,
  resolveAttemptUserText,
  selectPlaintextContextEvents,
} from './ai-context-manifest'
import { REVIEW_CONFIRM_CONTINUATION_TEXT } from './ai-conversation.constants'

describe('projectConversationEventsForAgent', () => {
  it('projects pinned User plaintext and drops unknown event kinds', () => {
    expect(
      projectConversationEventsForAgent([
        { sequence: 1, kind: 'user_message', payload: { text: '  帮我建一个喀纳斯3日团  ' } },
        { sequence: 2, kind: 'batch_status', payload: { batchId: 'batch-1', status: 'agent_running' } },
        { sequence: 3, kind: 'hidden_reasoning', payload: { text: 'should not leak' } },
      ]),
    ).toEqual([
      { sequence: 1, kind: 'user_message', text: '帮我建一个喀纳斯3日团' },
      { sequence: 2, kind: 'batch_status' },
    ])
  })

  it('keeps prior user and agent turns in the next attempt context', () => {
    const selected = selectPlaintextContextEvents(
      [
        { sequence: 1, kind: 'user_message', payload: { text: '路线按川西环线，日期还没定' } },
        { sequence: 2, kind: 'batch_status', payload: { status: 'completed' } },
        { sequence: 3, kind: 'agent_message', payload: { text: '出团日期是哪一天？' } },
        { sequence: 4, kind: 'user_message', payload: { text: '另外预计人数大概20人' } },
      ],
      4,
    )
    const projected = projectConversationEventsForAgent(selected)

    expect(projected.map((event) => event.text)).toEqual([
      '路线按川西环线，日期还没定',
      '出团日期是哪一天？',
      '另外预计人数大概20人',
    ])
    expect(
      composePlaintextUserText(
        '另外预计人数大概20人',
        projected,
      ),
    ).toContain('出团日期是哪一天？')
    expect(
      selectPlaintextContextEvents(
        [
          { sequence: 1, kind: 'user_message', payload: { text: '路线按川西环线，日期还没定' } },
          { sequence: 3, kind: 'agent_message', payload: { text: '出团日期是哪一天？' } },
          { sequence: 4, kind: 'user_message', payload: { text: '另外预计人数大概20人' } },
          { sequence: 6, kind: 'user_message', payload: { text: '认领后才出现的消息' } },
        ],
        4,
      ).map((event) => event.sequence),
    ).toEqual([1, 3, 4])
  })

  it('omits later queued user turns from a confirmed review continuation snapshot', () => {
    expect(
      selectPlaintextContextEvents(
        [
          { sequence: 1, kind: 'user_message', payload: { text: '请按这个团名建团' } },
          { sequence: 3, kind: 'agent_message', payload: { text: '已提交待审核建议，请在中间表单确认。' } },
          { sequence: 5, kind: 'user_message', payload: { text: '审核期间补一句' } },
          { sequence: 7, kind: 'batch_status', payload: { status: 'completed', disposition: 'confirmed' } },
        ],
        7,
        1,
      ).map((event) => event.sequence),
    ).toEqual([1, 3])
  })

  it('reads integer event sequences from the ContextManifest JSON', () => {
    expect(parseEventSequences([1, 2, '3', 0, -1, 4.5, 3])).toEqual([1, 2, 3])
    expect(parseEventSequences({ sequences: [1] })).toEqual([])
  })
})

describe('resolveAttemptUserText', () => {
  it('replaces the original request after a confirmed review continuation', () => {
    expect(
      resolveAttemptUserText('请按这个团名建团', {
        kind: 'batch_status',
        payload: { status: 'completed', disposition: 'confirmed' },
      }),
    ).toBe(REVIEW_CONFIRM_CONTINUATION_TEXT)
  })

  it('keeps the original request for a normal user turn', () => {
    expect(resolveAttemptUserText('请按这个团名建团', null)).toBe('请按这个团名建团')
    expect(
      resolveAttemptUserText('请按这个团名建团', {
        kind: 'user_message',
        payload: { text: '请按这个团名建团' },
      }),
    ).toBe('请按这个团名建团')
  })
})
