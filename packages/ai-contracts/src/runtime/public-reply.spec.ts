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

  it('does not persist an unclosed think block as the public reply', () => {
    expect(
      selectPublicReply({
        streamedPublicText: `<think>${SOLILOQUY}`,
        streamedReasoning: '',
        fullOutputText: `<think>${SOLILOQUY}`,
      }),
    ).toBe('已处理当前说明。')
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

  it('keeps an English-only business reply instead of falling back', () => {
    const reply =
      'The vehicle is booked for April 2 to April 6. Please confirm the supplier and total price in the review form.'
    expect(
      selectPublicReply({
        streamedPublicText: reply,
        streamedReasoning: '',
        fullOutputText: reply,
      }),
    ).toBe(reply)
  })

  it('still strips think tags from a public English business reply', () => {
    const reply =
      'The vehicle is booked for April 2 to April 6. Please confirm the supplier and total price in the review form.'
    expect(
      selectPublicReply({
        streamedPublicText: `<think>checking dates and supplier categories</think>${reply}`,
        streamedReasoning: '',
        fullOutputText: `<think>checking dates and supplier categories</think>${reply}`,
      }),
    ).toBe(reply)
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

  it('does not leak when the open tag itself is split across chunks', () => {
    const splitter = createThinkTagSplitter()
    expect(splitter.push('<thi')).toEqual([])
    expect(splitter.push(`nk>${SOLILOQUY}</think>${PUBLIC_REPLY}`)).toEqual([
      { channel: 'reasoning', text: SOLILOQUY },
      { channel: 'public', text: PUBLIC_REPLY },
    ])
  })

  it('does not leak when the close tag itself is split across chunks', () => {
    const splitter = createThinkTagSplitter()
    expect(splitter.push(`<think>${SOLILOQUY}</th`)).toEqual([
      { channel: 'reasoning', text: SOLILOQUY },
    ])
    expect(splitter.push(`ink>${PUBLIC_REPLY}`)).toEqual([
      { channel: 'public', text: PUBLIC_REPLY },
    ])
  })

  it('keeps unclosed think after a complete open tag off the public channel', () => {
    const splitter = createThinkTagSplitter()
    expect(splitter.push(`<think>${SOLILOQUY}`)).toEqual([
      { channel: 'reasoning', text: SOLILOQUY },
    ])
    expect(splitter.flush()).toEqual([])
  })

  it('flushes a leftover tag prefix as public when the run ends without completing it', () => {
    const splitter = createThinkTagSplitter()
    expect(splitter.push(`${PUBLIC_REPLY}<thi`)).toEqual([
      { channel: 'public', text: PUBLIC_REPLY },
    ])
    expect(splitter.flush()).toEqual([{ channel: 'public', text: '<thi' }])
  })
})
