import {
  CONTEXT_CAPACITY_ABORT_REASON,
  createTokenLimiterSafetyNet,
  type ProcessInputStepLike,
  type TokenLimiterLike,
} from './token-limiter-safety-net'

function textMessage(id: string, role: 'user' | 'assistant', text: string) {
  return {
    id,
    role,
    content: { format: 2 as const, parts: [{ type: 'text' as const, text }] },
  }
}

function messageChars(message: { content?: unknown }): number {
  return JSON.stringify(message.content ?? '').length
}

/** Contiguous newest-first limiter used as the Mastra TokenLimiter stand-in at this seam. */
function createContiguousLimiter(limit: number): TokenLimiterLike {
  return {
    async processInputStep(args: ProcessInputStepLike) {
      const systemChars = args.messageList
        .getAllSystemMessages()
        .reduce((sum, message) => sum + String(message.content ?? '').length, 0)
      const messages = args.messageList.get.all.db()
      const keep: typeof messages = []
      let used = systemChars
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message) {
          continue
        }
        const size = messageChars(message)
        if (used + size <= limit) {
          keep.unshift(message)
          used += size
        } else {
          break
        }
      }
      if (keep.length === 0) {
        const error = new Error(
          'TokenLimiterProcessor: No messages fit within the remaining token budget.',
        )
        error.name = 'TripWire'
        throw error
      }
      const keepIds = new Set(keep.map((message) => message.id))
      args.messageList.removeByIds(
        messages.filter((message) => !keepIds.has(message.id)).map((message) => message.id),
      )
    },
  }
}

function createList(
  messages: Array<{ id: string; role: string; content: unknown }>,
  system = '平台安全约束',
) {
  let current = [...messages]
  return {
    get: {
      all: {
        db: () => current,
      },
    },
    getAllSystemMessages: () => [{ role: 'system' as const, content: system }],
    removeByIds: (ids: string[]) => {
      const drop = new Set(ids)
      current = current.filter((message) => !drop.has(message.id))
    },
  }
}

function stepArgs(
  list: ReturnType<typeof createList>,
  stepNumber: number,
  state: Record<string, unknown> = {},
) {
  return {
    messageList: list,
    messages: list.get.all.db(),
    stepNumber,
    state,
    abort: (reason?: string): never => {
      throw new Error(reason ?? 'aborted')
    },
  }
}

describe('TokenLimiter safety net', () => {
  it('keeps the current User instruction on the initial model step', async () => {
    const limiter = createTokenLimiterSafetyNet({
      limit: 8_000,
      inner: createContiguousLimiter(8_000),
    })
    const list = createList([textMessage('user-1', 'user', '【本轮指令】请按喀纳斯三日团建团')])
    const state: Record<string, unknown> = {}

    await limiter.processInputStep(stepArgs(list, 0, state))

    expect(limiter.trimMode).toBe('contiguous')
    expect(list.get.all.db().map((message) => message.id)).toEqual(['user-1'])
    expect(state.currentInstructionId).toBe('user-1')
  })

  it('trims tool-loop growth on later steps but keeps a contiguous suffix and the current instruction', async () => {
    const limiter = createTokenLimiterSafetyNet({
      limit: 250,
      inner: createContiguousLimiter(250),
    })
    const current = textMessage('user-1', 'user', 'CURRENT')
    const bulky = textMessage('tool-old', 'assistant', `TOOL-RESULT-${'甲'.repeat(400)}`)
    const recent = textMessage('tool-new', 'assistant', 'latest')
    const list = createList([current, bulky, recent], 'sys')
    const state: Record<string, unknown> = { currentInstructionId: 'user-1' }

    await limiter.processInputStep(stepArgs(list, 1, state))

    const ids = list.get.all.db().map((message) => message.id)
    expect(ids).toContain('user-1')
    expect(ids).not.toContain('tool-old')
    expect(ids.at(-1)).toBe('tool-new')
  })

  it('fails observably instead of silently trimming the initial model step', async () => {
    const limiter = createTokenLimiterSafetyNet({
      limit: 250,
      inner: createContiguousLimiter(250),
    })
    const list = createList(
      [
        textMessage('user-1', 'user', 'CURRENT'),
        textMessage('extra', 'assistant', `HISTORY-${'甲'.repeat(400)}`),
      ],
      'sys',
    )

    await expect(limiter.processInputStep(stepArgs(list, 0))).rejects.toThrow(
      CONTEXT_CAPACITY_ABORT_REASON,
    )
    expect(list.get.all.db().map((message) => message.id)).toEqual(['user-1', 'extra'])
  })

  it('fails observably when mandatory content itself exceeds the safety limit', async () => {
    const limiter = createTokenLimiterSafetyNet({
      limit: 20,
      inner: createContiguousLimiter(20),
    })
    const list = createList([textMessage('user-1', 'user', `【本轮指令】${'甲'.repeat(800)}`)], 'sys')

    await expect(limiter.processInputStep(stepArgs(list, 0))).rejects.toThrow(
      CONTEXT_CAPACITY_ABORT_REASON,
    )
  })
})
