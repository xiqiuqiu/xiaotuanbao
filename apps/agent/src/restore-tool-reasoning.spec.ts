import {
  clearStoredToolCallReasoning,
  recordReasoningFromStream,
  rememberToolCallReasoning,
  restoreReasoningParts,
  wrapAgentStreamToRestoreToolReasoning,
} from './restore-tool-reasoning'

const toolCallMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: '' },
    {
      type: 'tool-call',
      toolCallId: 'call-get-context',
      toolName: 'getTaskContext',
      args: {},
    },
  ],
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of stream) {
    items.push(item)
  }
  return items
}

describe('restoreReasoningParts', () => {
  beforeEach(() => {
    clearStoredToolCallReasoning()
  })

  it('reattaches stored reasoning onto assistant tool-call messages', () => {
    rememberToolCallReasoning('call-get-context', 'need current draft before asking')

    expect(restoreReasoningParts([toolCallMessage])).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'need current draft before asking' },
          { type: 'text', text: '' },
          {
            type: 'tool-call',
            toolCallId: 'call-get-context',
            toolName: 'getTaskContext',
            args: {},
          },
        ],
      },
    ])
  })

  it('leaves messages unchanged when no stored reasoning matches', () => {
    expect(restoreReasoningParts([toolCallMessage])).toEqual([toolCallMessage])
  })
})

describe('recordReasoningFromStream', () => {
  beforeEach(() => {
    clearStoredToolCallReasoning()
  })

  it('stores reasoning from a step against each tool call in that step', async () => {
    await collect(
      recordReasoningFromStream(
        (async function* () {
          yield { type: 'reasoning-delta', payload: { text: 'check dates then ' } }
          yield { type: 'reasoning-delta', payload: { text: 'submit candidates' } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-submit', toolName: 'submitReviewPackage', args: {} },
          }
          yield { type: 'step-finish', payload: {} }
        })(),
      ),
    )

    expect(
      restoreReasoningParts([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-submit',
              toolName: 'submitReviewPackage',
              args: {},
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'check dates then submit candidates' },
          {
            type: 'tool-call',
            toolCallId: 'call-submit',
            toolName: 'submitReviewPackage',
            args: {},
          },
        ],
      },
    ])
  })
})

describe('wrapAgentStreamToRestoreToolReasoning', () => {
  beforeEach(() => {
    clearStoredToolCallReasoning()
  })

  it('replays captured reasoning on the next stream after CopilotKit drops it', async () => {
    const received: unknown[] = []
    const fake = {
      stream: async (input: unknown) => {
        received.push(input)
        return {
          fullStream: (async function* () {
            yield { type: 'reasoning-delta', payload: { text: 'wait for form confirm' } }
            yield {
              type: 'tool-call',
              payload: {
                toolCallId: 'call-await-decision',
                toolName: 'awaitReviewPackageDecision',
                args: {},
              },
            }
            yield { type: 'step-finish', payload: {} }
          })(),
        }
      },
    }

    const wrapped = wrapAgentStreamToRestoreToolReasoning(fake)
    const first = await wrapped.stream([
      { role: 'user', content: [{ type: 'text', text: '确认' }] },
    ])
    await collect(first.fullStream)

    const replayed = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-await-decision',
            toolName: 'awaitReviewPackageDecision',
            args: {},
          },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-await-decision' }] },
    ]
    await wrapped.stream(replayed)

    expect(received[1]).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'wait for form confirm' },
          {
            type: 'tool-call',
            toolCallId: 'call-await-decision',
            toolName: 'awaitReviewPackageDecision',
            args: {},
          },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-await-decision' }] },
    ])
  })
})
