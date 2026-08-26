import {
  TOKEN_LIMITER_PROCESSOR_VERSION,
  TOKEN_LIMITER_TRIM_MODE,
} from '@xiaotuanbao/ai-contracts'
import {
  CONTEXT_CAPACITY_ABORT_REASON,
  CURRENT_INSTRUCTION_TOKEN_LIMITER_ID,
  isTokenLimiterTripWire,
} from './capacity-tripwire'

export {
  CONTEXT_CAPACITY_ABORT_REASON,
  CURRENT_INSTRUCTION_TOKEN_LIMITER_ID,
  isTokenLimiterTripWire,
  TOKEN_LIMITER_PROCESSOR_VERSION,
  TOKEN_LIMITER_TRIM_MODE,
}

interface LimiterMessage {
  id: string
  role?: string
  content?: unknown
}

export interface LimiterMessageList {
  get: { all: { db: () => LimiterMessage[] } }
  getAllSystemMessages: () => Array<{ role?: string; content?: unknown }>
  removeByIds: (ids: string[]) => void
}

export interface ProcessInputStepLike {
  messageList: LimiterMessageList
  messages: LimiterMessage[]
  stepNumber: number
  state: Record<string, unknown>
  abort: (reason?: string, options?: { retry?: boolean; metadata?: unknown }) => never
}

export interface TokenLimiterLike {
  processInputStep: (args: ProcessInputStepLike) => Promise<unknown>
}

export interface TokenLimiterSafetyNetOptions {
  limit: number
  inner: TokenLimiterLike
}

/** Mastra TokenLimiter 的 processInputStep 参数更宽，运行时只读取 messageList。 */
export function adaptMastraTokenLimiter(inner: {
  processInputStep: (args: never) => Promise<unknown>
}): TokenLimiterLike {
  return {
    processInputStep: (args) => inner.processInputStep(args as never),
  }
}

export class CurrentInstructionTokenLimiterProcessor {
  readonly id = CURRENT_INSTRUCTION_TOKEN_LIMITER_ID
  readonly name = 'Current Instruction Token Limiter'
  readonly trimMode = TOKEN_LIMITER_TRIM_MODE
  readonly processorVersion = TOKEN_LIMITER_PROCESSOR_VERSION
  readonly limit: number
  private readonly inner: TokenLimiterLike

  constructor(options: TokenLimiterSafetyNetOptions) {
    this.limit = options.limit
    this.inner = options.inner
  }

  async processInputStep(args: ProcessInputStepLike): Promise<void> {
    const original = args.messageList.get.all.db()
    if (original.length === 0) {
      await this.inner.processInputStep(args)
      return
    }
    const protectedId = rememberCurrentInstruction(args, original)
    const protectedMessage = original.find((message) => message.id === protectedId)
    const following = protectedId
      ? original.slice(original.findIndex((message) => message.id === protectedId) + 1)
      : original

    if (protectedMessage) {
      const mandatoryKept = await this.keptIds([protectedMessage], args)
      if (mandatoryKept === 'trip' || !mandatoryKept.has(protectedMessage.id)) {
        args.abort(CONTEXT_CAPACITY_ABORT_REASON, {
          retry: false,
          metadata: { cause: 'mandatory_content_exceeds_limit' },
        })
      }
    }

    let suffix = following
    while (true) {
      const candidate = protectedMessage ? [protectedMessage, ...suffix] : suffix
      const kept = await this.keptIds(candidate, args)
      if (kept === 'trip') {
        if (suffix.length === 0) {
          args.abort(CONTEXT_CAPACITY_ABORT_REASON, {
            retry: false,
            metadata: { cause: 'mandatory_content_exceeds_limit' },
          })
        }
        suffix = suffix.slice(1)
        continue
      }
      if (protectedMessage && !kept.has(protectedMessage.id)) {
        if (suffix.length === 0) {
          args.abort(CONTEXT_CAPACITY_ABORT_REASON, {
            retry: false,
            metadata: { cause: 'current_instruction_dropped' },
          })
        }
        suffix = suffix.slice(1)
        continue
      }
      if (args.stepNumber === 0 && original.some((message) => !kept.has(message.id))) {
        args.abort(CONTEXT_CAPACITY_ABORT_REASON, {
          retry: false,
          metadata: { cause: 'initial_input_exceeds_safety_limit' },
        })
      }
      applyKeptIds(args.messageList, original, kept)
      return
    }
  }

  private async keptIds(
    candidate: LimiterMessage[],
    args: ProcessInputStepLike,
  ): Promise<Set<string> | 'trip'> {
    const trial = createTrialList(candidate, args.messageList.getAllSystemMessages())
    try {
      await this.inner.processInputStep({
        ...args,
        messageList: trial,
        messages: candidate,
      })
      return new Set(trial.get.all.db().map((message) => message.id))
    } catch (error) {
      if (isTokenLimiterTripWire(error)) {
        return 'trip'
      }
      throw error
    }
  }
}

export function createTokenLimiterSafetyNet(
  options: TokenLimiterSafetyNetOptions,
): CurrentInstructionTokenLimiterProcessor {
  return new CurrentInstructionTokenLimiterProcessor(options)
}

function rememberCurrentInstruction(
  args: ProcessInputStepLike,
  messages: LimiterMessage[],
): string | undefined {
  const existing = args.state.currentInstructionId
  if (typeof existing === 'string' && existing.length > 0) {
    return existing
  }
  const firstUser = messages.find((message) => message.role === 'user')
  if (firstUser) {
    args.state.currentInstructionId = firstUser.id
    return firstUser.id
  }
  return undefined
}

function applyKeptIds(
  messageList: LimiterMessageList,
  original: LimiterMessage[],
  kept: Set<string>,
): void {
  const idsToRemove = original.filter((message) => !kept.has(message.id)).map((message) => message.id)
  if (idsToRemove.length > 0) {
    messageList.removeByIds(idsToRemove)
  }
}

function createTrialList(
  messages: LimiterMessage[],
  systemMessages: Array<{ role?: string; content?: unknown }>,
): LimiterMessageList {
  let current = [...messages]
  return {
    get: {
      all: {
        db: () => current,
      },
    },
    getAllSystemMessages: () => systemMessages,
    removeByIds: (ids) => {
      const drop = new Set(ids)
      current = current.filter((message) => !drop.has(message.id))
    },
  }
}
