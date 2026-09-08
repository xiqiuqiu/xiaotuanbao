import { createThinkTagSplitter, selectPublicReply } from './public-reply'

const SOLILOQUY =
  '用户要建喀纳斯三日团。我先核团名、出团日期和人数，再决定是否提交审核建议。'
const PUBLIC_REPLY = '已提交待审核建议，请在中间表单确认。'

describe('selectPublicReply', () => {
  it('uses streamed public text and ignores reasoning mixed into full output', () => {
    expect(
      selectPublicReply({
        streamedPublicText: PUBLIC_REPLY,
        streamedReasoning: SOLILOQUY,
        fullOutputText: `${SOLILOQUY}${PUBLIC_REPLY}`,
      }),
    ).toBe(PUBLIC_REPLY)
  })

  it('strips streamed reasoning from full output when no public deltas arrived', () => {
    expect(
      selectPublicReply({
        streamedPublicText: '',
        streamedReasoning: [SOLILOQUY, '再核人数'],
        fullOutputText: `${SOLILOQUY}再核人数${PUBLIC_REPLY}`,
      }),
    ).toBe(PUBLIC_REPLY)
  })

  it('strips think tags from a thinking-disabled content blob', () => {
    expect(
      selectPublicReply({
        streamedPublicText: `<think>${SOLILOQUY}</think>${PUBLIC_REPLY}`,
        streamedReasoning: '',
        fullOutputText: `<think>${SOLILOQUY}</think>${PUBLIC_REPLY}`,
      }),
    ).toBe(PUBLIC_REPLY)
  })

  it('falls back to the generic completion line when nothing public remains', () => {
    expect(
      selectPublicReply({
        streamedPublicText: '',
        streamedReasoning: SOLILOQUY,
        fullOutputText: SOLILOQUY,
      }),
    ).toBe('已处理当前说明。')
  })

  it('does not persist English thinking-disabled soliloquy as the public reply', () => {
    const englishSoliloquy =
      "I'll check the current task context first, then help add a vehicle departure resource. The user wants to add a vehicle."
    expect(
      selectPublicReply({
        streamedPublicText: `${englishSoliloquy}\n${PUBLIC_REPLY}`,
        streamedReasoning: '',
        fullOutputText: `${englishSoliloquy}\n${PUBLIC_REPLY}`,
      }),
    ).toBe(PUBLIC_REPLY)
    expect(
      selectPublicReply({
        streamedPublicText: englishSoliloquy,
        streamedReasoning: '',
        fullOutputText: englishSoliloquy,
      }),
    ).toBe('已处理当前说明。')
  })
})

describe('createThinkTagSplitter', () => {
  it('routes think-tag soliloquy to reasoning even when the tags span deltas', () => {
    const splitter = createThinkTagSplitter()
    expect(splitter.push(`<think>${SOLILOQUY.slice(0, 8)}`)).toEqual([
      { channel: 'reasoning', text: SOLILOQUY.slice(0, 8) },
    ])
    expect(splitter.push(`${SOLILOQUY.slice(8)}</think>${PUBLIC_REPLY}`)).toEqual([
      { channel: 'reasoning', text: SOLILOQUY.slice(8) },
      { channel: 'public', text: PUBLIC_REPLY },
    ])
  })
})
